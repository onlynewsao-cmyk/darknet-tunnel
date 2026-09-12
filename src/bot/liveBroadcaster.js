/**
 * Live Broadcaster — emite eventos em tempo real pro dashboard via Socket.IO
 *
 * Eventos:
 * - user:command       → quando alguém usa um comando
 * - user:message       → qualquer mensagem recebida
 * - group:joined       → bot entrou em grupo / participante entrou
 * - group:left         → bot saiu / participante saiu
 * - bot:reaction       → bot reagiu
 */

let _io = null;

function setIO(io) {
  _io = io;
}

function emit(event, data) {
  if (!_io) return;
  try {
    _io.emit(event, { ...data, ts: Date.now() });
  } catch (e) {}
}

function userCommand(data) {
  // data: { command, user, number, group, success }
  emit('user:command', data);
}

function userMessage(data) {
  // data: { user, number, group, text, isCommand }
  emit('user:message', data);
}

function groupEvent(data) {
  // data: { type: 'add' | 'remove' | 'promote' | 'demote', group, participants }
  emit('group:event', data);
}

function botStatus(data) {
  emit('bot:status', data);
}

function botStat(key, value) {
  emit('bot:stat', { key, value });
}

function antilinkAction(data) {
  // data: { group, user, action, type, warns }
  emit('antilink:action', data);
}

module.exports = {
  setIO, emit,
  userCommand, userMessage, groupEvent,
  botStatus, botStat, antilinkAction,
};
