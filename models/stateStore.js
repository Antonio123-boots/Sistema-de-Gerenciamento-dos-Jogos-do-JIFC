const fs = require('fs');
const path = require('path');

const stateFilePath = path.join(__dirname, '..', 'data', 'jifc-state.json');

function cloneState(value) {
  return JSON.parse(JSON.stringify(value));
}

function readState() {
  try {
    if (!fs.existsSync(stateFilePath)) {
      return {};
    }

    const raw = fs.readFileSync(stateFilePath, 'utf8');
    if (!raw.trim()) {
      return {};
    }

    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function writeState(nextState) {
  fs.mkdirSync(path.dirname(stateFilePath), { recursive: true });
  fs.writeFileSync(stateFilePath, JSON.stringify(nextState, null, 2), 'utf8');
  return cloneState(nextState);
}

module.exports = {
  stateFilePath,
  readState,
  writeState,
  cloneState
};
