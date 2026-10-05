import { db, schema } from "../server/db/index.js";
console.log("orgs imediatamente:", (await db.buscar(schema.organizations)).length,
            "users:", (await db.contar(schema.users)));
await new Promise(r => setTimeout(r, 4000));
console.log("orgs depois de 4s:", (await db.buscar(schema.organizations)).map(o=>o.slug),
            "users:", (await db.contar(schema.users)));
process.exit(0);
