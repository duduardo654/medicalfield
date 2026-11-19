"""Cliente offline-first MedicalField: GUI web + SQLite local (Windows).
Execute exclusivamente na máquina do socorrista: nunca coloque SQLite na VM central.
"""
import json
import os
import sqlite3
import sys
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib import error, request
from urllib.parse import quote

import jwt
from dotenv import dotenv_values
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field
import uvicorn

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
ENV = {**dotenv_values(ROOT / '.env'), **os.environ}
DB_FILE = Path(ENV.get('CLIENT_DB_PATH') or HERE / 'data' / 'medicalfield.sqlite3')
CORE_URL = (ENV.get('CORE_URL') or 'http://localhost:8002').rstrip('/')
AUTH_URL = (ENV.get('AUTH_URL') or 'http://localhost:8001').rstrip('/')
BUSINESS_URL = (ENV.get('BUSINESS_URL') or 'http://localhost:8003').rstrip('/')
JWT_SECRET = ENV.get('JWT_SECRET')
JWT_ISSUER = 'medicalfield-auth'
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def utcnow():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')


@contextmanager
def database():
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE, timeout=20)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with database() as db:
        db.executescript('''
        CREATE TABLE IF NOT EXISTS pessoa (
            id TEXT PRIMARY KEY, data TEXT NOT NULL, origem TEXT NOT NULL,
            status TEXT NOT NULL, atualizado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS prontuario (
            id TEXT PRIMARY KEY, pessoa_id TEXT NOT NULL REFERENCES pessoa(id),
            data TEXT NOT NULL, origem TEXT NOT NULL, status TEXT NOT NULL, atualizado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS atendimento (
            id TEXT PRIMARY KEY, pessoa_id TEXT NOT NULL REFERENCES pessoa(id),
            prontuario_id TEXT NOT NULL REFERENCES prontuario(id), data TEXT NOT NULL,
            origem TEXT NOT NULL, status TEXT NOT NULL, atualizado_em TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox (
            op_id TEXT PRIMARY KEY, entidade TEXT NOT NULL, registro_id TEXT NOT NULL,
            operacao TEXT NOT NULL, profissional_id TEXT NOT NULL, criado_em TEXT NOT NULL,
            payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PENDENTE',
            tentativas INTEGER NOT NULL DEFAULT 0, erro TEXT);
        CREATE TABLE IF NOT EXISTS metadata (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS medicamento (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS logs_offline (
            id TEXT PRIMARY KEY, ocorrido_em TEXT NOT NULL, metodo TEXT NOT NULL,
            rota TEXT NOT NULL, status_code INTEGER NOT NULL, tempo_ms REAL NOT NULL,
            detalhe TEXT, status TEXT NOT NULL DEFAULT 'PENDENTE');
        ''')


init_db()


def professional(authorization: str | None):
    if not JWT_SECRET or not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, 'Autenticação necessária. Faça login online.')
    try:
        return jwt.decode(authorization[7:], JWT_SECRET, algorithms=['HS256'], issuer=JWT_ISSUER)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, 'Sessão expirada. Conecte-se e faça login novamente.')
    except jwt.InvalidTokenError:
        raise HTTPException(401, 'Token inválido.')


def online(db, client_mode=None):
    # Interface integrada: o modo é individual por aba/sessão de navegador.
    # Sem cabeçalho, mantém compatibilidade com clientes antigos e testes.
    if client_mode in ('online', 'offline'):
        return client_mode == 'online'
    value = db.execute("SELECT valor FROM metadata WHERE chave='online'").fetchone()
    return not value or value['valor'] == '1'


def require_online(db, client_mode=None):
    if not online(db, client_mode):
        raise HTTPException(409, 'Modo OFFLINE: acesso ao servidor bloqueado.')


def remote(method, path, token, data=None):
    body = json.dumps(data, ensure_ascii=False).encode('utf-8') if data is not None else None
    req = request.Request(CORE_URL + path, data=body, method=method,
                          headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        with request.urlopen(req, timeout=12) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except error.HTTPError as exc:
        detail = exc.read().decode('utf-8')[:500]
        raise HTTPException(exc.code, detail)
    except (error.URLError, TimeoutError) as exc:
        raise HTTPException(503, 'Servidor indisponível: ' + str(exc))


def save_local(db, entity, data, status='PENDENTE', origem='OFFLINE'):
    if entity == 'pessoa':
        db.execute('''INSERT INTO pessoa(id,data,origem,status,atualizado_em) VALUES(?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET data=excluded.data, origem=excluded.origem,
            status=excluded.status, atualizado_em=excluded.atualizado_em''',
            (data['id'], json.dumps(data, ensure_ascii=False), origem, status, utcnow()))
    else:
        db.execute(f'''INSERT INTO {entity}(id,pessoa_id,{ 'prontuario_id,' if entity == 'atendimento' else '' }
            data,origem,status,atualizado_em) VALUES({ '?,?,?,?,?,?' if entity == 'prontuario' else '?,?,?,?,?,?,?' })
            ON CONFLICT(id) DO UPDATE SET data=excluded.data,origem=excluded.origem,
            status=excluded.status,atualizado_em=excluded.atualizado_em''',
            ((data['id'], data['pessoa_id'], data.get('prontuario_id') or '', json.dumps(data, ensure_ascii=False), origem, status, utcnow())
             if entity == 'atendimento' else
             (data['id'], data['pessoa_id'], json.dumps(data, ensure_ascii=False), origem, status, utcnow())))


class Mode(BaseModel):
    online: bool


class Record(BaseModel):
    entidade: str
    dados: dict


@app.get('/')
def index():
    return FileResponse(HERE / 'static' / 'index.html')


@app.get('/app.js')
def script():
    return FileResponse(HERE / 'static' / 'app.js', media_type='application/javascript')


@app.get('/style.css')
def style():
    return FileResponse(ROOT / 'applications' / 'admin-portal' / 'style.css', media_type='text/css')


# Gateway de mesma origem: navegador acessa apenas a porta 3000.
# As APIs internas permanecem independentes em 8001/8002/8003.
def gateway(service, path, method, authorization=None, payload=None):
    bases = {'auth': AUTH_URL, 'core': CORE_URL, 'business': BUSINESS_URL}
    body = json.dumps(payload, ensure_ascii=False).encode('utf-8') if payload is not None else None
    req = request.Request(bases[service] + path, data=body, method=method,
         headers={**({'Authorization': authorization} if authorization else {}),
                  'Content-Type': 'application/json'})
    try:
        with request.urlopen(req, timeout=15) as resp:
            return Response(content=resp.read(), status_code=resp.status,
                            media_type=resp.headers.get('Content-Type', 'application/json'))
    except error.HTTPError as exc:
        return Response(content=exc.read(), status_code=exc.code,
                        media_type=exc.headers.get('Content-Type', 'application/json'))
    except (error.URLError, TimeoutError):
        raise HTTPException(503, 'Serviço central indisponível.')


class Login(BaseModel):
    identificacao: str
    senha: str


@app.post('/api/auth/login')
def gateway_login(credentials: Login):
    return gateway('auth', '/auth/login', 'POST', payload=credentials.model_dump())


@app.get('/api/central/{entity}')
def central_list(entity: str, authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    user = professional(authorization)
    if user.get('perfil') != 'ADMIN':
        raise HTTPException(403, 'Somente administradores podem visualizar os dados oficiais.')
    if entity not in ('pessoa', 'prontuario', 'atendimento', 'medicamento'):
        raise HTTPException(404, 'Entidade inválida')
    with database() as db:
        require_online(db, x_client_mode)
    service = 'business' if entity == 'medicamento' else 'core'
    return gateway(service, '/' + entity, 'GET', authorization)


@app.put('/api/central/{entity}/{record_id}')
def central_update(entity: str, record_id: uuid.UUID, body: dict,
                   authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    user = professional(authorization)
    if user.get('perfil') != 'ADMIN':
        raise HTTPException(403, 'Somente administradores.')
    if entity not in ('pessoa', 'prontuario', 'atendimento'):
        raise HTTPException(404, 'Entidade inválida')
    with database() as db:
        require_online(db, x_client_mode)
    path = '/atendimento/detalhe/' if entity == 'atendimento' else '/' + entity + '/'
    return gateway('core', path + str(record_id), 'PUT', authorization, body)


@app.delete('/api/central/{entity}/{record_id}')
def central_delete(entity: str, record_id: uuid.UUID,
                   authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    user = professional(authorization)
    if user.get('perfil') != 'ADMIN':
        raise HTTPException(403, 'Somente administradores.')
    if entity not in ('pessoa', 'prontuario', 'atendimento'):
        raise HTTPException(404, 'Entidade inválida')
    with database() as db:
        require_online(db, x_client_mode)
    path = '/atendimento/detalhe/' if entity == 'atendimento' else '/' + entity + '/'
    return gateway('core', path + str(record_id), 'DELETE', authorization)


@app.get('/api/ficha/{record_id}/pdf')
def proxy_pdf(record_id: uuid.UUID, authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        require_online(db, x_client_mode)
    return gateway('business', '/ficha/' + str(record_id) + '/pdf', 'GET', authorization)


class EmailPayload(BaseModel):
    destinatario: str


@app.post('/api/ficha/{record_id}/email')
def proxy_email(record_id: uuid.UUID, body: EmailPayload,
                authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        require_online(db, x_client_mode)
    return gateway('business', '/ficha/' + str(record_id) + '/email', 'POST', authorization, body.model_dump())


@app.post('/api/medicamentos/remotos')
def create_medicamento(body: dict, authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        require_online(db, x_client_mode)
    return gateway('business', '/medicamento', 'POST', authorization, body)


@app.get('/api/medicamentos/remotos')
def proxy_medicamentos(authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        require_online(db, x_client_mode)
    return gateway('business', '/medicamento', 'GET', authorization)


@app.get('/api/state')
def state(authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        count = db.execute("SELECT COUNT(*) n FROM outbox WHERE status != 'SINCRONIZADO'").fetchone()['n']
        return {'online': online(db, x_client_mode), 'pendentes': count}


@app.post('/api/network')
def set_mode(mode: Mode, authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    # Navegadores modernos enviam X-Client-Mode e não compartilham modo global.
    # Compatibilidade com clientes antigos: mantém a opção de modo persistente.
    if x_client_mode is None:
        with database() as db:
            db.execute("INSERT INTO metadata(chave,valor) VALUES('online',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor",
                       ('1' if mode.online else '0',))
    return {'online': mode.online}


# Rotas específicas de medicamentos devem preceder a rota genérica /api/{entity}.
@app.get('/api/medicamento')
def local_medicamentos(authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        return [json.loads(r['data']) for r in db.execute('SELECT data FROM medicamento ORDER BY id')]


@app.post('/api/medicamento/cache')
def cache_medicamentos(body: list[dict], authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    with database() as db:
        require_online(db, x_client_mode)
        for item in body:
            db.execute('INSERT INTO medicamento(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
                       (item['id'], json.dumps(item, ensure_ascii=False)))
    return {'salvos': len(body)}


@app.get('/api/{entity}')
def list_records(entity: str, authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    professional(authorization)
    if entity not in ('pessoa', 'prontuario', 'atendimento'):
        raise HTTPException(404, 'Entidade inválida')
    with database() as db:
        # Em ONLINE, ocultar pendentes do cache. Não equivale a consultar
        # o banco oficial: para isso existe /api/central/{entity}.
        query = f'SELECT * FROM {entity}'
        if online(db, x_client_mode):
            query += " WHERE status='SINCRONIZADO'"
        query += ' ORDER BY atualizado_em DESC'
        return [dict(json.loads(r['data']), _status=r['status'], _origem=r['origem'])
                for r in db.execute(query)]


@app.post('/api/record')
def new_record(body: Record, authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    user = professional(authorization)
    entity = body.entidade
    if entity not in ('pessoa', 'prontuario', 'atendimento'):
        raise HTTPException(422, 'Entidade inválida')
    data = dict(body.dados)
    now = utcnow()
    data['id'] = str(uuid.uuid4())
    data['client_created_at'] = now
    data['client_updated_at'] = now
    if entity == 'atendimento':
        data['data_hora'] = data.get('data_hora') or now
    if entity == 'pessoa' and len(str(data.get('nome', '')).strip()) < 2:
        raise HTTPException(422, 'Informe o nome da pessoa.')
    if entity == 'atendimento' and len(str(data.get('queixa_principal', '')).strip()) < 2:
        raise HTTPException(422, 'Informe a queixa principal.')
    with database() as db:
        if entity != 'pessoa':
            if not db.execute('SELECT 1 FROM pessoa WHERE id=?', (data.get('pessoa_id'),)).fetchone():
                raise HTTPException(422, 'Pessoa não encontrada neste dispositivo. Atualize os dados primeiro.')
        if entity == 'atendimento':
            pr = db.execute('SELECT id FROM prontuario WHERE pessoa_id=?', (data['pessoa_id'],)).fetchone()
            if not pr:
                raise HTTPException(422, 'Crie um prontuário para esta pessoa antes do atendimento.')
            data['prontuario_id'] = pr['id']
        if entity == 'prontuario' and db.execute('SELECT 1 FROM prontuario WHERE pessoa_id=?', (data['pessoa_id'],)).fetchone():
            raise HTTPException(409, 'Esta pessoa já possui prontuário.')
        # Origem representa o modo de criacao; nao o meio de transporte da Outbox.
        modo_criacao = 'ONLINE' if online(db, x_client_mode) else 'OFFLINE'
        data['origem_registro'] = modo_criacao
        save_local(db, entity, data, origem=modo_criacao)
        db.execute('''INSERT INTO outbox(op_id,entidade,registro_id,operacao,profissional_id,criado_em,payload,status)
            VALUES (?,?,?,?,?,?,?,?)''',
            (str(uuid.uuid4()), entity, data['id'], 'CREATE', user['sub'], now,
             json.dumps(data, ensure_ascii=False), 'PENDENTE'))
        if not online(db, x_client_mode):
            db.execute('''INSERT INTO logs_offline(id,ocorrido_em,metodo,rota,status_code,tempo_ms,detalhe)
                VALUES(?,?,?,?,?,?,?)''', (str(uuid.uuid4()), now, 'POST', '/' + entity, 201, 0,
                                       'Registro persistido localmente em modo OFFLINE'))
    # O registro foi confirmado localmente (transação encerrada); online, tenta publicar
    # imediatamente no banco central. Se a rede falhar, preserva a Outbox para nova tentativa.
    # UUID e op_id permanecem constantes para que a repetição seja idempotente.
    confirmed = False
    issue = None
    with database() as db:
        enabled = online(db, x_client_mode)
        entry = db.execute('SELECT * FROM outbox WHERE entidade=? AND registro_id=?',
                           (entity, data['id'])).fetchone()
    if enabled:
        op = {'op_id': entry['op_id'], 'entidade': entity, 'operacao': 'CREATE',
              'registro_id': data['id'], 'profissional_id': user['sub'],
              'client_created_at': now, 'payload': data}
        try:
            answer = remote('POST', '/sync/push', authorization[7:], {'operacoes': [op]})
            result = answer['resultados'][0]
            confirmed = result.get('resultado') in ('APPLIED', 'MERGED', 'CONFLICT_RESOLVED', 'DUPLICATE')
            if not confirmed:
                issue = result.get('mensagem') or result.get('resultado') or 'Envio não confirmado.'
        except (HTTPException, KeyError, IndexError, TypeError) as exc:
            issue = str(exc.detail) if isinstance(exc, HTTPException) else 'Resposta inesperada do servidor.'
        with database() as db:
            if confirmed:
                db.execute("UPDATE outbox SET status='SINCRONIZADO', erro=NULL, tentativas=tentativas+1 WHERE op_id=?", (entry['op_id'],))
                db.execute(f"UPDATE {entity} SET status='SINCRONIZADO' WHERE id=?", (data['id'],))
            else:
                db.execute('UPDATE outbox SET tentativas=tentativas+1, erro=? WHERE op_id=?', (issue, entry['op_id']))
    return dict(data, _status='SINCRONIZADO' if confirmed else 'PENDENTE',
                confirmado=confirmed, pendente=not confirmed,
                aviso=('Registro salvo neste dispositivo e aguardando envio ao servidor.' if enabled else
                       'Registro salvo neste dispositivo. Será enviado quando a conexão voltar.') if not confirmed else
                      'Registro salvo e confirmado no servidor.')


@app.post('/api/sync')
def synchronize(authorization: str | None = Header(default=None),
                 x_client_mode: str | None = Header(default=None)):
    user = professional(authorization)
    token = authorization[7:]
    with database() as db:
        require_online(db, x_client_mode)
        entries = db.execute("SELECT * FROM outbox WHERE status != 'SINCRONIZADO' ORDER BY criado_em, rowid").fetchall()
        results = []
        for entry in entries:
            op = {'op_id': entry['op_id'], 'entidade': entry['entidade'], 'operacao': entry['operacao'],
                  'registro_id': entry['registro_id'], 'profissional_id': entry['profissional_id'],
                  'client_created_at': entry['criado_em'], 'payload': json.loads(entry['payload'])}
            try:
                result = remote('POST', '/sync/push', token, {'operacoes': [op]})['resultados'][0]
            except HTTPException as exc:
                db.execute('UPDATE outbox SET tentativas=tentativas+1, erro=? WHERE op_id=?', (str(exc.detail), entry['op_id']))
                results.append({'op_id': entry['op_id'], 'resultado': 'ERRO_REDE', 'mensagem': str(exc.detail)})
                break  # respeita dependências em ordem
            outcome = result['resultado']
            success = outcome in ('APPLIED', 'MERGED', 'CONFLICT_RESOLVED', 'DUPLICATE')
            if success:
                db.execute("UPDATE outbox SET status='SINCRONIZADO',erro=NULL,tentativas=tentativas+1 WHERE op_id=?", (entry['op_id'],))
                db.execute(f"UPDATE {entry['entidade']} SET status='SINCRONIZADO' WHERE id=?", (entry['registro_id'],))
            else:
                db.execute("UPDATE outbox SET status='ERRO',erro=?,tentativas=tentativas+1 WHERE op_id=?",
                           (result.get('mensagem', outcome), entry['op_id']))
                if result.get('retentavel'):
                    results.append(result)
                    break
            results.append(result)
        # Pull sem apagar registros locais ainda pendentes. Cursor avança somente após commit local.
        cursor_row = db.execute("SELECT valor FROM metadata WHERE chave='cursor'").fetchone()
        cursor = cursor_row['valor'] if cursor_row else '1970-01-01T00:00:00Z'
        pulled = remote('GET', '/sync/pull?since=' + cursor, token)
        counts = {}
        for entity, key in [('pessoa', 'pessoas'), ('prontuario', 'prontuarios'), ('atendimento', 'atendimentos')]:
            counts[entity] = 0
            for item in pulled.get(key, []):
                exists = db.execute(f'SELECT status FROM {entity} WHERE id=?', (item['id'],)).fetchone()
                if exists and exists['status'] != 'SINCRONIZADO':
                    continue
                if entity != 'pessoa':
                    if not db.execute('SELECT 1 FROM pessoa WHERE id=?', (item['pessoa_id'],)).fetchone():
                        continue
                if entity == 'atendimento' and not db.execute('SELECT 1 FROM prontuario WHERE id=?', (item['prontuario_id'],)).fetchone():
                    continue
                save_local(db, entity, item, 'SINCRONIZADO', 'SERVIDOR')
                counts[entity] += 1
        db.execute("INSERT INTO metadata(chave,valor) VALUES('cursor',?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor",
                   (pulled['cursor'],))
        # Logs registrados durante o offline são enviados pelo endpoint específico.
        offline_logs = db.execute("SELECT * FROM logs_offline WHERE status='PENDENTE'").fetchall()
        if offline_logs:
            logs = [{'log_id': row['id'], 'ocorrido_em': row['ocorrido_em'], 'metodo': row['metodo'],
                     'rota': row['rota'], 'status_code': row['status_code'], 'tempo_ms': row['tempo_ms'],
                     'detalhe': row['detalhe']} for row in offline_logs]
            try:
                remote('POST', '/log', token, {'registros': logs})
                db.executemany("UPDATE logs_offline SET status='SINCRONIZADO' WHERE id=?", [(r['id'],) for r in offline_logs])
            except HTTPException:
                pass  # retenta na próxima sincronização
        return {'resultados': results, 'recebidos': counts, 'pendentes': db.execute("SELECT COUNT(*) n FROM outbox WHERE status != 'SINCRONIZADO'").fetchone()['n']}


if __name__ == '__main__':
    port = int(ENV.get('APP_PORT') or ENV.get('ADMIN_PORTAL_PORT') or '3000')
    uvicorn.run(app, host='127.0.0.1', port=port)
