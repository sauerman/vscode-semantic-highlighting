'use strict';

import {
	IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments,
	InitializeResult
} from 'vscode-languageserver';

import initConfig from './config';

let tokenizer = require('tokenizer');

let workspaceRoot: string;
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
		}
	}
});

let documents: TextDocuments = new TextDocuments();
documents.listen(connection);
initConfig(connection, documents, tokenizeDocument);

let worker = tokenizer.createTokenizer({
	grammar: tokenizer.grammars.javascript,
	bufferSize: 100000
});

function walkScopes(tokens, index, scope, parentContext = undefined) {
	let scopes = [];
	if (!parentContext) {
		parentContext = tokens.getContextLeft(index);
	} else {
		parentContext = tokens.getParentContext(parentContext);
	}
	const isInScope = tokens.isInScope(index, scope);
	const parentScope = tokens.getParentScope(parentContext);

	if (isInScope) {
		scopes.push([isInScope, scope]);
	} else if (parentScope || parentScope !== scope) {
		scopes = scopes.concat(walkScopes(tokens, index, parentScope, parentContext));
	}
	return scopes;
}

function serializeToken(tokens, index, mappings) {
	const scope = tokens.getScope(index);
	const type = tokens.getType(index);
	const semantic = tokens.getSemantic(index);

	let scopes;
	if (mappings.type[type] === 'identifier') {
		const mappedSemantic = mappings.semantic[semantic];
		if (mappedSemantic !== 'argument' && mappedSemantic !== 'variable') {
			scopes = walkScopes(tokens, index, scope);
		} else {
			const isInScope = tokens.isInScope(index, scope);
			scopes = [[isInScope, scope]];
		}
	}

	return {
		index,
		type,
		row: tokens.getRow(index),
		col: tokens.getCol(index),
		id: tokens.getId(index),
		// hash: tokens.getHash(index),
		value: tokens.getValue(index),
		context: tokens.getContext(index),
		semantic,
		// chunk: tokens.getChunk(index),
		// contextLeft: tokens.getContextLeft(index),
		// contextRight: tokens.getContextRight(index),
		contextLevel: tokens.getContextLevel(index),
		next: tokens.getNext(index),
		// previous: tokens.getPrevious(index),

		// nextContextRight: tokens.getNextContextRight(index),
		isContextLeft: tokens.isContextLeft(index),
		isContextRight: tokens.isContextRight(index),

		scope,
		scopes,
	}
}

const debug = { time: 0 };
function tokenizeDocument(uri: string, content: string): void {
	debug.time = new Date().getTime();
	let result = worker.tokenize(content);
	connection.console.log(`tokenize() ${new Date().getTime() - debug.time}`);
	debug.time = new Date().getTime();
	result = worker.semantica();
	connection.console.log(`semantica() ${new Date().getTime() - debug.time}`);
	debug.time = new Date().getTime();

	let tokens = [];
	for (let i = 0; i <= result.tokenCount; i += 1) {
		tokens[i] = serializeToken(result.tokens, i, worker.mappings);
	}

	connection.console.log(`serialize() ${new Date().getTime() - debug.time}`);
	connection.console.log(`tokens: ${result.tokenCount}`);

	connection.sendRequest('updateDecorators', uri, result, tokens, worker.mappings);
}

connection.onDidChangeWatchedFiles((_change) => {
	connection.console.log('We recevied an file change event');
});

connection.onDidOpenTextDocument((params) => {
	tokenizeDocument(params.textDocument.uri, params.textDocument.text);
	//connection.console.log(`${params.textDocument.uri} opened.`);
});

connection.onDidChangeTextDocument((params) => {
	tokenizeDocument(params.textDocument.uri, params.contentChanges[0].text);

	if (params.contentChanges.length > 1) {
		connection.console.log('OHOHOH multiple changes detected!');
	}

	//connection.console.log(`${params.textDocument.uri} onDidChangeTextDocument`);
});

connection.listen();