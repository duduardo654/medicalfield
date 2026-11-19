"""Teste de isolamento de visualização por sessão (sem duplicar portas/bancos)."""
import importlib.util
import os
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from datetime import datetime, timezone, timedelta
import jwt
from fastapi.testclient import TestClient

class IsolamentoSessaoTest(unittest.TestCase):
    def test_pendente_invisivel_online_ate_sincronizar(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {'CLIENT_DB_PATH':str(Path(tmp)/'sqlite.db'), 'JWT_SECRET':'segredo-local-testes-mais-32-caracteres'}):
                spec=importlib.util.spec_from_file_location('client_isolado',Path(__file__).parent/'server.py')
                mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
                client=TestClient(mod.app)
                claims={'iss':'medicalfield-auth','sub':'b1','exp':datetime.now(timezone.utc)+timedelta(hours=1)}
                jwt_token=jwt.encode(claims,'segredo-local-testes-mais-32-caracteres',algorithm='HS256')
                base={'Authorization':'Bearer '+jwt_token}
                off={**base,'X-Client-Mode':'offline'}
                on={**base,'X-Client-Mode':'online'}
                assert client.get('/api/state', headers=off).json()['online'] is False
                assert client.get('/api/state', headers=on).json()['online'] is True
                created=client.post('/api/record',headers=off,json={'entidade':'pessoa','dados':{'nome':'Teste pendente'}})
                assert created.status_code==200,created.text
                assert created.json()['_status']=='PENDENTE'
                assert len(client.get('/api/pessoa',headers=off).json())==1
                assert client.get('/api/pessoa',headers=on).json()==[]
                with patch.object(mod,'remote') as remote:
                    remote.side_effect=lambda method,path,token,data=None: (
                        {'resultados':[{'resultado':'APPLIED'}]} if path=='/sync/push' else
                        {'cursor':'2026-11-18T12:00:00Z','pessoas':[], 'prontuarios':[], 'atendimentos':[]} if path.startswith('/sync/pull') else
                        {'gravados':0})
                    done=client.post('/api/sync',headers=on)
                    assert done.status_code==200, done.text
                assert len(client.get('/api/pessoa',headers=on).json())==1
                assert client.get('/api/pessoa',headers=on).json()[0]['_status']=='SINCRONIZADO'

if __name__=='__main__':unittest.main()
