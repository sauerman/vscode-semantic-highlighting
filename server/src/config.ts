export default function (connection, documents, validateTextDocument) {
  // The settings interface describe the server relevant settings part
  interface Settings {
    lspSample: ExampleSettings;
  }

  // These are the example settings we defined in the client's package.json
  // file
  interface ExampleSettings {
    maxNumberOfProblems: number;
  }

  // hold the maxNumberOfProblems setting
  let config: ExampleSettings = {
    maxNumberOfProblems: 150,
  };

  // The settings have changed. Is send on server activation
  // as well.
  connection.onDidChangeConfiguration((change) => {
    let settings = <Settings>change.settings;
    config.maxNumberOfProblems = settings.lspSample.maxNumberOfProblems || 100;
    // Revalidate any open text documents
    documents.all().forEach(validateTextDocument);
  });

  return {
    get maxNumberOfProblems() {
      return config.maxNumberOfProblems;
    }
  };
}