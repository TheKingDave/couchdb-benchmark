import _nano from "nano";

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

const _try = async (func, msg) => {
    try {
        await func();
    } catch (e) {
        msg && console.log(msg);
    }
};

const measure = async (func, startMsg, endMsg) => {
    startMsg && console.log(startMsg);
    const start = new Date();
    await func();
    const end = new Date();
    const diff = end - start;
    console.log(endMsg + ` Took ${diff/1000}s`);
    return diff;
};

const insertX = async (db, num, prefix = '') => {
    for (let i = 0; i < num; i++) {
        await db.insert(exampleJson, prefix + i);
    }
};

const runBenchmark = async (docs, dbs) => {
    const number = docs * dbs;
    console.log("----------------------------------------");
    console.log(`Running benchmark with ${docs} docs und ${dbs} dbs`);
    const nano1 = _nano('http://localhost:5984');
    const nano2 = _nano('http://localhost:5985');

    await _try(() => nano1.db.destroy('alice'), 'Alice (db1) not destroyed');
    await _try(() => nano2.db.destroy('alice'), 'Alice (db2) not destroyed');

    await nano1.db.create('alice');
    const alice = nano1.db.use('alice');

    // INSERT
    const singleInsert = await measure(async () => {
        await insertX(alice, number);
    }, `Insert ${number} elements`, 'Insert finished.');

    // REPLICATE
    const singleReplicate = await measure(async () => {
        await alice.replicate(`http://db2:5984/${alice.config.db}`, {create_target: true});
    }, 'Start replication.', 'End Replication.');

    const _dbs = [];

    for (let d = 0; d < dbs; d++) {
        await _try(() => nano1.db.destroy(`db${d}`), 'db${d} (db1) not destroyed');
        await nano1.db.create(`db${d}`);
        _dbs.push(nano1.db.use(`db${d}`));
    }

    // Insert
    const multiInsert = await measure(async () => {
        for (let db of _dbs) {
            await insertX(db, docs);
        }
    }, `Insert ${docs} docs into ${dbs} DBs`, 'Finished inserts.');

    // Sync
    const multiSync = await measure(async () => {
        for (let db of _dbs) {
            await db.replicate(`http://db2:5984/${db.config.db}`, {create_target: true});
        }
    }, `Sync ${docs} docs ${dbs} DBs`, 'Sync inserts.');


    console.log(`Finished benchmark with ${docs} docs und ${dbs} dbs`);
    console.log("-----------------------------------------");
    return {
        singleInsert,
        singleReplicate,
        multiInsert,
        multiSync,
    };
};

const main = async () => {
    const results = {};
    for (let d = 1; d <= 8; d=d*2) {
        for (let i = 100; i <= 10000; i = i * 10) {
            const docs = (i/d)|0;
            const res = await runBenchmark(docs, d);
            results[`dbs{${d}};docs{${docs}};`] = res;
        }
    }
    console.log(results);
};

main()
    .then(() => console.log("FINISH"))
    .catch(e => console.error(e, e.stack));
