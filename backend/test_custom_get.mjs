import fetch from 'node-fetch';

async function run() {
  const res = await fetch('http://localhost:9000/store/custom', {
    headers: {
      'x-publishable-api-key': 'pk_0fe0acedabe024a5796f8d25743f7bee8c2dedbda4289ff73a294feec410db1b'
    }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Data:', JSON.stringify(data, null, 2));
}

run();
