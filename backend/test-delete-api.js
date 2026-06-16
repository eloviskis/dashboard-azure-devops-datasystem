const axios = require('axios');

const PASSWORDS_TO_TRY = ['Pwk8q12v@'];

(async () => {
  try {
    for (const pwd of PASSWORDS_TO_TRY) {
      try {
        const res = await axios.post('http://localhost:3001/api/auth/login', { username: 'admin', password: pwd });
        if (res.data.token) {
          console.log('Login OK com senha:', pwd);
          const token = res.data.token;

          const listRes = await axios.get('http://localhost:3001/api/ceremonies/records/overview?from=2025-06-01&to=2026-06-30', {
            headers: { Authorization: 'Bearer ' + token }
          });
          const records = listRes.data.records;
          console.log('Total registros:', records.length);

          if (records.length > 0) {
            const id = records[records.length - 1].id;
            console.log('Testando DELETE id =', id, '(', records[records.length - 1].team, ')');
            const delRes = await axios.delete('http://localhost:3001/api/ceremonies/records/' + id, {
              headers: { Authorization: 'Bearer ' + token }
            });
            console.log('DELETE status:', delRes.status, JSON.stringify(delRes.data));

            const listRes2 = await axios.get('http://localhost:3001/api/ceremonies/records/overview?from=2025-06-01&to=2026-06-30', {
              headers: { Authorization: 'Bearer ' + token }
            });
            console.log('Apos delete:', listRes2.data.records.length, 'registros (era', records.length, ')');
          }
          return;
        }
      } catch (e) { /* senha errada */ }
    }
    console.log('Nenhuma senha funcionou');
  } catch (e) {
    console.error('Erro:', e.message);
  }
})();
