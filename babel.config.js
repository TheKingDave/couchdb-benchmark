const presets = [
    [
        "@babel/env",
        {
            targets: {
                node: 'current'
            },
            useBuiltIns: "usage",
            corejs: "core-js@3"
        }
    ]
];

module.exports = {presets}