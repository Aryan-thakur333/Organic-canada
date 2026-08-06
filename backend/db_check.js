const { Client } = require("pg");
const dbUrl = "postgres://postgres:9426695327@localhost:5432/medusa-backend";

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const res = await client.query("SELECT * FROM pos_operator_assignment WHERE operator_id = 'user_01KWPV0WK7J0KN2A8FZ0AD3T16'");
    console.log("[DB_RESULTS]");
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
