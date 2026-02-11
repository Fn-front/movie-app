const requireEffectCleanup = require('./requireEffectCleanup');

const plugin = {
  rules: {
    'require-effect-cleanup': requireEffectCleanup,
  },
};

module.exports = plugin;
