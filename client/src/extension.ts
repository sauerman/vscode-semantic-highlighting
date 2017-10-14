'use strict';

import * as path from 'path';

import { window, workspace, ExtensionContext, TextEditor, TextDocument, Range } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';

let color = require('tinycolor2');

let startColor = 'rgb(115, 230, 115)';
let colors = [];
for (let i = 0; i <= 23; i += 1) {
	colors[i] = color(startColor).spin(i * 15).toString();
}

let colorCache = {};
let decorators = [];

let activeEditor: TextEditor = window.activeTextEditor;
let activeDocument: TextDocument = activeEditor.document;


function addDecorationsContextBoundary(tokens, color) {
	const decorator = window.createTextEditorDecorationType({ color });
	const ranges = tokens.map(token => ({
		range: new Range(token.row, token.col, token.row, token.col + token.value.length),
	}));

	activeEditor.setDecorations(decorator, ranges);
	decorators.push(decorator);
}

function addDecorationsIdentifier(tokens, color) {
	const decorator = window.createTextEditorDecorationType({
		color,
		overviewRulerColor: color,
		overviewRulerLane: 1,
		textDecoration: 'underline'
	});
	const ranges = tokens.map(token => ({
		range: new Range(token.row, token.col, token.row, token.col + token.value.length),
	}));

	activeEditor.setDecorations(decorator, ranges);
	decorators.push(decorator);
}

export function activate(context: ExtensionContext) {
	let serverModule = context.asAbsolutePath(path.join('server', 'server.js'));
	let debugOptions = { execArgv: ["--nolazy", "--debug=6009"] };

	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	let clientOptions: LanguageClientOptions = {
		documentSelector: [{ scheme: 'file', language: 'javascript' }],
		synchronize: {
			// Synchronize the setting section 'languageServerExample' to the server
			configurationSection: 'lspSample',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		}
	}

	let debug = { time: 0 };
	let client = new LanguageClient('vscode-colorizer', 'colorizer', serverOptions, clientOptions);
	client.onReady().then(() => {
		client.onRequest('updateDecorators', (uri, cache, tokens, mappings) => {
			if (uri.indexOf(activeDocument.uri.path) === -1) {
				return;
			}

			cache;

			decorators.forEach(decorator => decorator.dispose());
			decorators = [];
			colorCache = {};

			debug.time = new Date().getTime();

			let newContextBoundaryDecoratorsByColor = {};
			let newIdentifierDecoratorsByColor = {};

			tokens.forEach(token => {
				const type = mappings.type[token.type];
				// const context = mappings.context[token.context];
				const semantic = mappings.semantic[token.semantic];

				if (token.isContextLeft || token.isContextRight) {
					let textColor = colors[(token.contextLevel * 8) % 24];

					if (!newContextBoundaryDecoratorsByColor[textColor]) {
						newContextBoundaryDecoratorsByColor[textColor] = [];
					}
					newContextBoundaryDecoratorsByColor[textColor].push(token);
				}

				if (semantic === 'argument' || semantic === 'variable') {
					let key = token.contextLevel + '-' + token.id;
					colorCache[key] = colors[((token.scope * 8) + token.id) % 24];

					if (!newIdentifierDecoratorsByColor[colorCache[key]]) {
						newIdentifierDecoratorsByColor[colorCache[key]] = [];
					}
					newIdentifierDecoratorsByColor[colorCache[key]].push(token);
				}

				if (type === 'identifier') {
					const firstScope = token.scopes[0];
					if (firstScope) {
						const ref = firstScope[0];
						let key = tokens[ref].contextLevel + '-' + tokens[ref].id;

						if (colorCache[key]) {
							newIdentifierDecoratorsByColor[colorCache[key]].push(token);
						} else {
							//console.log(token.row, token.col, token.value, 'STRANGE: SHOULD HAVE COLOR');
						}
					}
				}
			});

			Object.keys(newContextBoundaryDecoratorsByColor)
				.forEach(color => addDecorationsContextBoundary(newContextBoundaryDecoratorsByColor[color], color));

			Object.keys(newIdentifierDecoratorsByColor)
				.forEach(color => addDecorationsIdentifier(newIdentifierDecoratorsByColor[color], color));

			console.log('tokens.forEach', new Date().getTime() - debug.time);
		});
	});

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(client.start());

	window.onDidChangeActiveTextEditor(editor => {
		activeEditor = editor;
		activeDocument = editor.document;
	}, null, context.subscriptions);

	workspace.onDidChangeTextDocument(event => {
		activeDocument = event.document;
	}, null, context.subscriptions);
}
