import _nano from "nano";
import fs from 'fs';

const exampleJson = {
    "glossary": {
        "title": "example glossary",
        "GlossDiv": {
            "title": "S",
            "GlossList": {
                "GlossEntry": {
                    "ID": "SGML",
                    "SortAs": "SGML",
                    "GlossTerm": "Standard Generalized Markup Language",
                    "Acronym": "SGML",
                    "Abbrev": "ISO 8879:1986",
                    "GlossDef": {
                        "para": "A meta-markup language, used to create markup languages such as DocBook.",
                        "GlossSeeAlso": ["GML", "XML"]
                    },
                    "GlossSee": "markup"
                }
            }
        }
    }
};

let log = (msg) => {
    console.log(msg);
};

const _try = async (func, msg) => {
    try {
        await func();
    } catch (e) {
        msg && log(msg);
    }
};

const measure = async (func, startMsg, endMsg) => {
    startMsg && log(startMsg);
    const start = new Date();
    await func();
    const end = new Date();
    const diff = end - start;
    log(endMsg + ` Took ${diff / 1000}s`);
    return diff;
};

const insertX = async (db, num, prefix = '') => {
    for (let i = 0; i < num; i++) {
        await db.insert(exampleJson, prefix + i);
    }
};

const bulkInsertX = async (db, num, prefix = '') => {
    const docs = [];
    for(let i = 0; i < num; i++) {
        docs.push({_id: prefix + i});
    }
    await db.bulk({docs});
};

const runBenchmark = async (docs, dbs) => {
    log("----------------------------------------");
    log(`Running benchmark with ${docs} docs und ${dbs} dbs`);

    const nano1 = _nano('http://admin:password@localhost:5984');

    const _dbs = [];

    for (let d = 0; d < dbs; d++) {
        await _try(() => nano1.db.destroy(`db${d}`), `db${d} (db1) not destroyed`);
        await nano1.db.create(`db${d}`);
        _dbs.push(nano1.db.use(`db${d}`));
    }

    // Insert
    const insert = await measure(async () => {
        for (let db of _dbs) {
            await bulkInsertX(db, docs);
        }
    }, `Insert ${docs} docs into ${dbs} DBs`, 'Finished inserts.');

    // Sync
    const sync = await measure(async () => {
        for (let db of _dbs) {
            await db.replicate(`http://admin:password@db2:5984/${db.config.db}`, {create_target: true});
        }
    }, `Sync ${docs} docs ${dbs} DBs`, 'Sync inserts.');

    // Destroy
    for (let db of _dbs) {
        await nano1.db.destroy(db.config.db);
    }

    log(`Finished benchmark with ${docs} docs und ${dbs} dbs`);
    log("-----------------------------------------");
    return {
        insert,
        sync,
    };
};

const main = async () => {
    const nTimes = 100;

    const avgResults = [];
    const results = [];
    for (let d = 1; d <= 16; d = d * 2) {
        for (let i = 16; i <= 8192; i = i * 2) {
            const docs = i;

            let avgInsert = 0;
            let avgSync = 0;
            for(let a = 0; a < 100; a++) {
                const res = await runBenchmark(docs, d);
                results.push(Object.assign({
                    dbs: d,
                    docs: docs,
                }, res));
                avgInsert += res.insert;
                avgSync += res.sync;
            }
            avgResults.push({
                dbs: d,
                docs: docs,
                insert: avgInsert / nTimes,
                sync: avgInsert / nTimes,
                fullInsert: avgInsert,
                fullSync: avgSync,
            });

        }
    }
    fs.writeFileSync('average.json', JSON.stringify(avgResults));
    fs.writeFileSync('results.json', JSON.stringify(results));
};

main()
    .then(() => log("FINISH"))
    .catch(e => console.error(e, e.stack));
