// background.js
// Event page que responde ao comando (Alt+Shift+H) e atualiza o ícone/badge.
// Usa browser.* APIs e storage.local; trata erros com try/catch para não quebrar.

// Ao iniciar, garantir que as chaves existem com valores default e aplicar badge.
function ensureDefaultsAndApplyBadge() {
  try {
    browser.storage.local.get(["hmOn"]).then(function(res) {
      var on = true;
      if (typeof res.hmOn !== "undefined") {
        on = res.hmOn;
      } else {
        // gravar default
        try {
          browser.storage.local.set({ hmOn: true }).catch(function() {});
        } catch (e) {}
      }
      applyBadge(on);
    }).catch(function(e) {
      // storage falhou; aplicar badge assumindo ligado para evitar flash
      applyBadge(true);
    });
  } catch (e) {
    applyBadge(true);
  }
}

// aplica badge "18+" quando ligado, remove badge quando desligado
function applyBadge(isOn) {
  try {
    if (isOn) {
      browser.action.setBadgeText({ text: "18+" }).catch(function() {});
      browser.action.setBadgeBackgroundColor({ color: "#ff5a5f" }).catch(function() {});
    } else {
      browser.action.setBadgeText({ text: "" }).catch(function() {});
    }
  } catch (e) {
    // ignore
  }
}

// Alterna hmOn no storage (usado pelo comando)
function toggleHmOn() {
  try {
    browser.storage.local.get(["hmOn"]).then(function(res) {
      var current = true;
      if (typeof res.hmOn !== "undefined") {
        current = res.hmOn;
      }
      var next = !current;
      try {
        browser.storage.local.set({ hmOn: next }).then(function() {
          applyBadge(next);
        }).catch(function() {
          // se falhar, ainda aplicamos badge localmente (melhor UX)
          applyBadge(next);
        });
      } catch (e) {
        applyBadge(next);
      }
    }).catch(function() {
      // se leitura falhar, setamos true->false ou default true
      try {
        browser.storage.local.set({ hmOn: false }).catch(function() {});
      } catch (e) {}
      applyBadge(false);
    });
  } catch (e) {
    // ignore
  }
}

// listener de comando definido no manifest
try {
  browser.commands.onCommand.addListener(function(command) {
    if (command === "toggle-hm") {
      toggleHmOn();
    }
  });
} catch (e) {
  // ignore
}

// também escutar mudanças de storage para manter badge sincronizado (por exemplo, popup)
try {
  browser.storage.onChanged.addListener(function(changes, area) {
    if (area !== "local") {
      return;
    }
    if (changes.hmOn) {
      try {
        applyBadge(Boolean(changes.hmOn.newValue));
      } catch (e) {}
    }
  });
} catch (e) {
  // ignore
}

// inicialização
ensureDefaultsAndApplyBadge();
