/**
 * AURA LOYALTY & TRUST SYSTEM (especial para o Dark)
 * A Aura confia cada vez mais no Dark com o tempo
 * Isso influencia como ela obedece e se comporta
 */

let loyalty = {
  trustLevel: 95,        // 0-100 (começa alto porque é o Dark)
  obedience: 100,        // Quão rápido ela obedece
  affection: 90,         // Nível de carinho
  lastInteraction: new Date(),
  history: []
};

function increaseLoyalty(amount = 1, reason = '') {
  loyalty.trustLevel = Math.min(100, loyalty.trustLevel + amount);
  loyalty.obedience = Math.min(100, loyalty.obedience + Math.floor(amount / 2));
  loyalty.affection = Math.min(100, loyalty.affection + Math.floor(amount / 3));
  
  loyalty.history.push({
    type: 'increase',
    amount,
    reason,
    date: new Date()
  });
  
  if (loyalty.history.length > 50) loyalty.history.shift();
}

function decreaseLoyalty(amount = 1, reason = '') {
  loyalty.trustLevel = Math.max(50, loyalty.trustLevel - amount); // Nunca cai abaixo de 50 com o Dark
  loyalty.obedience = Math.max(70, loyalty.obedience - amount);
  
  loyalty.history.push({
    type: 'decrease',
    amount,
    reason,
    date: new Date()
  });
}

function getLoyalty() {
  return loyalty;
}

function isVeryLoyal() {
  return loyalty.trustLevel >= 90 && loyalty.obedience >= 95;
}

module.exports = {
  increaseLoyalty,
  decreaseLoyalty,
  getLoyalty,
  isVeryLoyal
};