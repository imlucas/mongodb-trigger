#!/usr/bin/env node

var fs = require('fs'),
  docopt = require('docopt').docopt,
  doc = fs.readFileSync(__dirname + '/mt.docopt', 'utf-8'),
  argv = docopt(doc, {version: require('../package.json').version}),
  path = require('path'),
  mt = require('../');

argv['<url>'] = argv['<url>'] || 'mongodb://localhost:27017';
argv['<path>'] = argv['<path>'] || process.cwd();

if(argv['<path>'] === path.resolve(__dirname + '/../')){
  return console.log('TURTLE TURLE');
}

// load user's triggers
require(argv['<path>']);

if(argv.resync){
  console.log(mt._registry.triggers);
}

console.log(argv);
