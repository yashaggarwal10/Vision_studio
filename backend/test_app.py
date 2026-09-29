import io
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
import pandas as pd
from fastapi.testclient import TestClient
from app import app, context_for

class ApiTests(unittest.TestCase):
    def setUp(self): self.client=TestClient(app)
    def test_health_does_not_return_credential(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':'secret-value'}):
            response=self.client.get('/api/health')
        self.assertTrue(response.json()['ai_configured'])
        self.assertNotIn('secret-value',response.text)
    def test_csv_upload_handles_missing_values(self):
        response=self.client.post('/api/upload-dataset',files={'dataset':('sample.csv',b'category,value\nA,10\nB,\n','text/csv')})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json()['rows'][1]['value'],None)
    def test_xlsx_upload(self):
        buf=io.BytesIO();pd.DataFrame({'category':['A','B'],'value':[10,20]}).to_excel(buf,index=False)
        response=self.client.post('/api/upload-dataset',files={'dataset':('sample.xlsx',buf.getvalue())})
        self.assertEqual(response.status_code,200);self.assertEqual(response.json()['row_count'],2)
    def test_upload_rejects_unsupported_and_empty_files(self):
        self.assertEqual(self.client.post('/api/upload-dataset',files={'dataset':('sample.exe',b'bad')}).status_code,415)
        self.assertEqual(self.client.post('/api/upload-dataset',files={'dataset':('sample.csv',b'category,value\n')}).status_code,422)
    def test_context_detects_dates_and_nullable_numbers(self):
        ctx=context_for([{'date':'2026-01-01','value':None},{'date':'2026-02-01','value':10}])
        self.assertEqual(ctx['columns'][0]['type'],'date');self.assertEqual(ctx['columns'][1]['mean'],10)
    def test_missing_provider_configuration_is_actionable(self):
        with patch.dict(os.environ,{'GROQ_API_KEY':''}):
            response=self.client.post('/api/generate-dashboard',json={'prompt':'Show totals','rows':[{'v':1}]})
        self.assertEqual(response.status_code,503);self.assertIn('manually',response.json()['detail'])
    def test_generation_validates_provider_output_and_repairs_once(self):
        good={'title':'Overview','widgets':[{'type':'bar','title':'Revenue','x':'category','y':'value','agg':'sum'}]}
        bad={'title':'Overview','widgets':[{'type':'bar','title':'Revenue','x':'invented','y':'value','agg':'sum'}]}
        def reply(value): return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(value)))])
        mock=MagicMock();mock.__enter__.return_value=mock
        mock.chat.completions.create.side_effect=[reply(bad),reply(good)]
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('app.Groq',return_value=mock):
            response=self.client.post('/api/generate-dashboard',json={'prompt':'Show revenue by category','rows':[{'category':'A','value':10}]})
        self.assertEqual(response.status_code,200);self.assertEqual(mock.chat.completions.create.call_count,2)
        self.assertNotIn('layout',response.json()['dashboard']['widgets'][0])
    def test_persistent_invalid_plan_never_reaches_frontend(self):
        mock=MagicMock();mock.__enter__.return_value=mock
        mock.chat.completions.create.return_value=SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"title":"Bad","widgets":[]}'))])
        with patch.dict(os.environ,{'GROQ_API_KEY':'test'}),patch('app.Groq',return_value=mock):
            response=self.client.post('/api/generate-dashboard',json={'prompt':'Show data','rows':[{'v':1}]})
        self.assertEqual(response.status_code,502)

if __name__=='__main__': unittest.main()
