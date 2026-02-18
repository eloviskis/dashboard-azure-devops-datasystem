require('dotenv').config();
const https = require('https');

const AZURE_ORG = process.env.AZURE_ORG;
const AZURE_PROJECT = process.env.AZURE_PROJECT;
const AZURE_PAT = process.env.AZURE_PAT;

function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Campos Custom que o código está tentando ler (extraído do sync-standalone.js)
const CAMPOS_NO_CODIGO = {
  'Custom.PO': 'po',
  'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028': 'codeReviewLevel1 (Nível 1)',
  'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e': 'codeReviewLevel2 (Nível 2)',
  'Custom.Tipocliente': 'tipoCliente',
  'Custom.Type': 'customType',
  'Custom.RootCauseStatus': 'rootCauseStatus',
  'Custom.Squad': 'squad',
  'Custom.Area': 'area',
  'Custom.REINCIDENCIA': 'reincidencia',
  'Custom.PerformanceDays': 'performanceDays',
  'Custom.QA': 'qa',
  'Custom.Complexity': 'complexity',
  'Custom.Raizdoproblema': 'causaRaiz',
  'Custom.DOR': 'readyDate',
  'Custom.DOD': 'doneDate',
  'Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5': 'identificacao',
  'Custom.Falhadoprocesso': 'falhaDoProcesso',
  'Custom.Rootcausetask': 'rootCauseTask',
  'Custom.rootcauseteam': 'rootCauseTeam',
  'Custom.EntryDate': 'entryDate'
};

async function verifyFields() {
  try {
    console.log('🔍 VERIFICANDO CAMPOS CUSTOM DO PROJETO\n');
    console.log('=' .repeat(80));
    
    // Buscar todos os campos do projeto
    const url = `https://dev.azure.com/${AZURE_ORG}/${AZURE_PROJECT}/_apis/wit/fields?api-version=7.1`;
    const auth = 'Basic ' + Buffer.from(':' + AZURE_PAT).toString('base64');
    
    const res = await httpsRequest(url, {
      method: 'GET',
      headers: {
        'Authorization': auth,
        'Content-Type': 'application/json'
      }
    });
    
    if (!res.value) {
      console.log('❌ Erro ao buscar campos');
      return;
    }
    
    // Criar mapa de campos reais
    const camposReais = new Map();
    res.value.forEach(f => {
      if (f.referenceName && f.referenceName.startsWith('Custom.')) {
        camposReais.set(f.referenceName, {
          nome: f.name,
          tipo: f.type,
          description: f.description || ''
        });
      }
    });
    
    console.log(`📊 Total de campos Custom no Azure DevOps: ${camposReais.size}`);
    console.log(`📝 Total de campos Custom no código: ${Object.keys(CAMPOS_NO_CODIGO).length}`);
    console.log('=' .repeat(80));
    
    // Verificar campos do código que não existem no Azure
    console.log('\n❌ CAMPOS NO CÓDIGO QUE NÃO EXISTEM NO AZURE DEVOPS:');
    console.log('-'.repeat(80));
    let inconsistenciasEncontradas = 0;
    
    Object.entries(CAMPOS_NO_CODIGO).forEach(([refName, varName]) => {
      if (!camposReais.has(refName)) {
        inconsistenciasEncontradas++;
        console.log(`${inconsistenciasEncontradas}. ${refName}`);
        console.log(`   Variável: ${varName}`);
        console.log(`   ⚠️  CAMPO NÃO EXISTE NO AZURE DEVOPS!`);
        console.log();
      }
    });
    
    if (inconsistenciasEncontradas === 0) {
      console.log('✅ Todos os campos do código existem no Azure DevOps');
    }
    
    // Verificar se há campos similares (possíveis erros de digitação)
    console.log('\n🔎 VERIFICANDO POSSÍVEIS CAMPOS SIMILARES:');
    console.log('-'.repeat(80));
    
    Object.entries(CAMPOS_NO_CODIGO).forEach(([refName, varName]) => {
      if (!camposReais.has(refName)) {
        // Procurar campos com nomes similares
        const nomeBuscado = refName.replace('Custom.', '').toLowerCase();
        const similares = [];
        
        camposReais.forEach((info, realRefName) => {
          const nomeReal = realRefName.replace('Custom.', '').toLowerCase();
          const nomeRealDisplay = info.nome.toLowerCase();
          
          // Verificar similaridade
          if (nomeReal.includes(nomeBuscado) || nomeBuscado.includes(nomeReal) ||
              nomeRealDisplay.includes(nomeBuscado) || nomeBuscado.includes(nomeRealDisplay)) {
            similares.push({ refName: realRefName, ...info });
          }
        });
        
        if (similares.length > 0) {
          console.log(`\n❓ Para "${refName}" (${varName}):`);
          similares.forEach(s => {
            console.log(`   → Possível: ${s.refName}`);
            console.log(`     Nome: ${s.nome}`);
            console.log(`     Tipo: ${s.tipo}`);
          });
        }
      }
    });
    
    // Listar campos Custom existentes no Azure mas não usados no código
    console.log('\n\n💡 CAMPOS CUSTOM NO AZURE QUE NÃO ESTÃO SENDO LIDOS:');
    console.log('-'.repeat(80));
    
    let naoUsados = 0;
    camposReais.forEach((info, refName) => {
      const usado = Object.keys(CAMPOS_NO_CODIGO).some(campo => 
        campo === refName || campo.toLowerCase() === refName.toLowerCase()
      );
      
      if (!usado) {
        naoUsados++;
        console.log(`${naoUsados}. ${refName}`);
        console.log(`   Nome: ${info.nome}`);
        console.log(`   Tipo: ${info.tipo}`);
        if (info.description) {
          console.log(`   Descrição: ${info.description}`);
        }
        console.log();
      }
    });
    
    console.log('=' .repeat(80));
    console.log(`\n📈 RESUMO:`);
    console.log(`   • Campos com inconsistência: ${inconsistenciasEncontradas}`);
    console.log(`   • Campos disponíveis mas não usados: ${naoUsados}`);
    console.log(`   • Campos sendo lidos corretamente: ${Object.keys(CAMPOS_NO_CODIGO).length - inconsistenciasEncontradas}`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

verifyFields();
