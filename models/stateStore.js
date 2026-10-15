const fs = require('fs');
const path = require('path');

const stateFilePath = path.join(__dirname, '..', 'data', 'jifc-state.json');

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseState(raw, origem = stateFilePath) {
  try {
    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw new Error('O conteúdo precisa ser um objeto JSON.');
    }
    return state;
  } catch (error) {
    throw new Error(`O estado local está inválido (${origem}): ${error.message}`, { cause: error });
  }
}

function readState() {
  let raw;
  try {
    raw = fs.readFileSync(stateFilePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Não foi possível ler o estado local (${stateFilePath}): ${error.message}`, { cause: error });
  }
  return parseState(raw);
}

function writeState(nextState) {
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fs.writeFileSync(stateFilePath, JSON.stringify(nextState, null, 2), 'utf8');
  return cloneState(nextState);
}

module.exports = {
  stateFilePath,
  parseState,
  readState,
  writeState,
  cloneState
};
