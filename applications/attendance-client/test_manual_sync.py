"""Protege a regra de sincronizacao acionada apenas pelo botao da interface."""
from pathlib import Path
import unittest


class SincronizacaoManualTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder = Path(__file__).resolve().parent
        cls.js = (folder / 'static' / 'app.js').read_text(encoding='utf-8')
        cls.html = (folder / 'static' / 'index.html').read_text(encoding='utf-8')
        cls.server = (folder / 'server.py').read_text(encoding='utf-8')

    def test_botao_e_o_unico_disparador_de_sync(self):
        self.assertIn("$('sync').onclick=()=>sync();", self.js)
        self.assertEqual(self.js.count('await sync('), 0)
        self.assertEqual(self.js.count('sync(true)'), 0)
        self.assertNotIn('changed.sincronizar', self.js)

    def test_nao_receber_medicamentos_automaticamente(self):
        self.assertIn('async function loadMedicamentos(receber=false)', self.js)
        self.assertIn('if(online&&receber)', self.js)
        self.assertIn('await loadMedicamentos(true);', self.js)

    def test_interface_documenta_acao_manual(self):
        self.assertIn('só são enviados ao clicar em Sincronizar agora', self.html)
        self.assertIn("return {'online': mode.online}", self.server)


if __name__ == '__main__':
    unittest.main()
