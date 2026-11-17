"""Testes locais de persistência/offline; independem do PostgreSQL."""
import importlib.util
import os
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone
from pathlib import Path
import jwt
from fastapi.testclient import TestClient

class ClienteOfflineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        os.environ['CLIENT_DB_PATH'] = str(Path(self.tmp.name)/'test.sqlite3')
        os.environ['JWT_SECRET'] = 'teste-local-segredo-com-mais-de-32-caracteres'
        spec = importlib.util.spec_from_file_location('mfclient', Path(__file__).parent/'server.py')
        self.m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.m)
        self.client = TestClient(self.m.app)
        claims = {'iss':'medicalfield-auth','sub':'00000000-0000-4000-8000-0000000000b1',
                  'exp':datetime.now(timezone.utc)+timedelta(hours=2)}
        self.headers = {'Authorization':'Bearer '+jwt.encode(claims, 'teste-local-segredo-com-mais-de-32-caracteres',algorithm='HS256')}

    def tearDown(self):
        self.tmp.cleanup()
        os.environ.pop('CLIENT_DB_PATH',None)
        os.environ.pop('JWT_SECRET',None)

    def post(self,path,data):
        return self.client.post(path,headers=self.headers,json=data)

    def test_offline_dependency_outbox(self):
        self.assertEqual(self.post('/api/network', {'online':False}).status_code,200)
        p=self.post('/api/record',{'entidade':'pessoa','dados':{'nome':'Paciente Fictício'}})
        self.assertEqual(p.status_code,200,p.text)
        pid=p.json()['id']
        pr=self.post('/api/record',{'entidade':'prontuario','dados':{'pessoa_id':pid,'alergias':'Nenhuma'}})
        self.assertEqual(pr.status_code,200,pr.text)
        at=self.post('/api/record',{'entidade':'atendimento','dados':{'pessoa_id':pid,'queixa_principal':'Dor'}})
        self.assertEqual(at.status_code,200,at.text)
        self.assertEqual(self.client.get('/api/state',headers=self.headers).json()['pendentes'],3)
        self.assertEqual(self.post('/api/sync',{}).status_code,409)
        self.assertEqual(len(self.client.get('/api/atendimento',headers=self.headers).json()),1)
        with self.m.database() as db:
            self.assertEqual([r['entidade'] for r in db.execute('SELECT entidade FROM outbox ORDER BY rowid')],['pessoa','prontuario','atendimento'])

    def test_push_pull_confirmado(self):
        self.post('/api/network', {'online': False})
        created = self.post('/api/record', {'entidade':'pessoa', 'dados':{'nome':'Paciente Offline'}}).json()
        calls = []
        def fake_remote(method, path, token, data=None):
            calls.append((method, path))
            if path == '/sync/push':
                return {'resultados':[{'op_id':data['operacoes'][0]['op_id'], 'resultado':'APPLIED',
                                       'canonical_id':created['id']} ]}
            if path.startswith('/sync/pull'):
                return {'cursor':'2026-11-16T23:00:00Z', 'pessoas':[{'id':created['id'],'nome':'Paciente Offline'}],
                        'prontuarios':[], 'atendimentos':[]}
            if path == '/log':
                return {'gravados':1}
            raise AssertionError(path)
        self.post('/api/network', {'online': True})
        with patch.object(self.m,'remote',side_effect=fake_remote):
            response = self.post('/api/sync', {})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['pendentes'], 0)
        self.assertEqual(response.json()['resultados'][0]['resultado'], 'APPLIED')
        self.assertTrue(any('/sync/push' == path for method,path in calls))
        self.assertEqual(self.client.get('/api/pessoa',headers=self.headers).json()[0]['_status'], 'SINCRONIZADO')

    def test_online_saves_central_with_confirmation(self):
        def fake_remote(method, path, token, data=None):
            self.assertEqual(path, '/sync/push')
            return {'resultados': [{'resultado': 'APPLIED'}]}
        with patch.object(self.m, 'remote', side_effect=fake_remote):
            result = self.post('/api/record', {'entidade':'pessoa','dados':{'nome':'Pessoa online'}})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()['confirmado'])
        self.assertEqual(result.json()['_status'], 'SINCRONIZADO')
        self.assertEqual(self.client.get('/api/state', headers=self.headers).json()['pendentes'], 0)

    def test_online_server_down_stays_pending(self):
        with patch.object(self.m, 'remote', side_effect=self.m.HTTPException(503, 'Servidor indisponível')):
            result = self.post('/api/record', {'entidade':'pessoa','dados':{'nome':'Pessoa sem sinal'}})
        self.assertEqual(result.status_code, 200, result.text)
        self.assertFalse(result.json()['confirmado'])
        self.assertEqual(result.json()['_status'], 'PENDENTE')
        self.assertEqual(self.client.get('/api/state', headers=self.headers).json()['pendentes'], 1)

    def test_login_same_origin_proxy(self):
        from fastapi.responses import Response
        with patch.object(self.m, 'gateway', return_value=Response(content='{"access_token":"TEST"}',media_type='application/json')) as gw:
            resp = self.client.post('/api/auth/login', json={'identificacao':'ADMIN-001','senha':'teste'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['access_token'], 'TEST')
        self.assertEqual(gw.call_args.args[:3], ('auth', '/auth/login', 'POST'))

    def test_central_requires_admin_and_online(self):
        from fastapi.responses import Response
        with patch.object(self.m, 'gateway', return_value=Response(content='[]',media_type='application/json')) as gw:
            self.assertEqual(self.client.get('/api/central/pessoa',headers=self.headers).status_code,403)
            claims = {'iss':'medicalfield-auth','sub':'00000000-0000-4000-8000-0000000000b1', 'perfil':'ADMIN',
                      'exp':datetime.now(timezone.utc)+timedelta(hours=2)}
            headers={'Authorization':'Bearer '+jwt.encode(claims,'teste-local-segredo-com-mais-de-32-caracteres',algorithm='HS256')}
            self.assertEqual(self.client.get('/api/central/pessoa',headers=headers).status_code,200)
            self.assertEqual(gw.call_args.args[:3], ('core','/pessoa','GET'))
            self.post('/api/network',{'online':False})
            self.assertEqual(self.client.get('/api/central/pessoa',headers=headers).status_code,409)

    def test_auth_required(self):
        self.assertEqual(self.client.get('/api/pessoa').status_code,401)
        self.assertEqual(self.client.get('/api/pessoa',headers={'Authorization':'Bearer INVALID'}).status_code,401)

if __name__=='__main__': unittest.main()
