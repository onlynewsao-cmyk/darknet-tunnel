/**
 * AURA SCHEDULED ACTIONS
 * A Aura pode lembrar de fazer algo depois
 * Ex: "Aura me lembra de mandar mensagem pro fulano amanhã"
 */

const scheduled = [];

function scheduleAction(action, delayMs, data = {}) {
  const executeAt = Date.now() + delayMs;
  scheduled.push({
    id: Date.now(),
    action,
    data,
    executeAt
  });
  return { success: true, id: scheduled[scheduled.length - 1].id };
}

function getDueActions() {
  const now = Date.now();
  return scheduled.filter(a => a.executeAt <= now);
}

function removeAction(id) {
  const index = scheduled.findIndex(a => a.id === id);
  if (index !== -1) scheduled.splice(index, 1);
}

module.exports = {
  scheduleAction,
  getDueActions,
  removeAction
};