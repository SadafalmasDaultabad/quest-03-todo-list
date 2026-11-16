/* ==========================================================================
   Daybook — script.js
   A to-do list written in plain JavaScript (no libraries).

   How it works, in one paragraph:
   All tasks live in one array called state.tasks. Every action (add, edit,
   toggle, delete, filter) changes that array, saves it to localStorage, and
   then calls render(). render() rebuilds the visible list from the array.
   So the screen always matches the data.
   ========================================================================== */

(function () {
  'use strict';

  /* 1. SETTINGS ---------------------------------------------------------- */
  var STORAGE_KEY = 'daybook.tasks.v1'; // the name our data is saved under
  var SEED_FIRST_RUN = true;            // set to false to start with an empty list on the very first visit
  var MAX_LENGTH = 200;                 // longest allowed task text
  var LEAVE_MS = 180;                   // how long the "delete" animation runs
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var SEED_TASKS = [
    { text: 'Sketch the layout of the to-do app', completed: true },
    { text: 'Write the add, edit and delete logic', completed: false },
    { text: 'Try the filters, then reload the page to check that tasks are saved', completed: false },
    { text: 'Submit Quest 3 to Thiranex', completed: false }
  ];

  /* 2. STATE: the single source of truth --------------------------------- */
  var state = {
    tasks: [],          // [{ id, text, completed, createdAt }]
    filter: 'all',      // 'all' | 'active' | 'completed'
    editingId: null     // id of the task being edited, or null
  };

  var newestId = null;     // lets render() animate only the task that was just added
  var pendingFocus = null; // where keyboard focus should land after the next render

  /* 3. PAGE ELEMENTS ----------------------------------------------------- */
  function $(selector) {
    return document.querySelector(selector);
  }

  var els = {
    date: $('#today-date'),
    summary: $('#hero-summary'),
    progress: $('#progress'),
    progressBar: $('#progress-bar'),
    progressValue: $('#progress-value'),
    form: $('#add-form'),
    input: $('#new-task'),
    addError: $('#add-error'),
    filters: $('#filters'),
    filterButtons: Array.prototype.slice.call(document.querySelectorAll('.filters__btn')),
    list: $('#task-list'),
    empties: Array.prototype.slice.call(document.querySelectorAll('[data-empty]')),
    foot: $('#panel-foot'),
    itemsLeft: $('#items-left'),
    clearCompleted: $('#clear-completed'),
    storageNote: $('#storage-note'),
    announcer: $('#announcer')
  };

  var RING_LENGTH = 163.36; // length of the progress circle (2 × π × 26)

  /* 4. STORAGE: save and load with window.localStorage -------------------- */
  var storage = {
    // Returns an array of tasks, or null if nothing valid has been saved yet.
    load: function () {
      try {
        var raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return null;
        var data = JSON.parse(raw);
        if (!Array.isArray(data)) return null;
        return data
          .filter(function (item) {
            return item && typeof item.text === 'string' && item.text.trim() !== '';
          })
          .map(function (item) {
            var id = typeof item.id === 'string' && /^[\w-]+$/.test(item.id) ? item.id : makeId();
            return {
              id: id,
              text: item.text.slice(0, MAX_LENGTH),
              completed: Boolean(item.completed),
              createdAt: Number(item.createdAt) || Date.now()
            };
          });
      } catch (error) {
        return null;
      }
    },

    // Returns true if saving worked, false if the browser blocked it.
    save: function (tasks) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        return true;
      } catch (error) {
        return false;
      }
    }
  };

  /* 5. SMALL HELPERS ----------------------------------------------------- */
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Trims the text, squeezes repeated spaces, and enforces the length limit.
  // An empty result means "blank", which we never save.
  function cleanText(value) {
    return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function announce(message) {
    els.announcer.textContent = message;
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  function findItem(id) {
    return els.list.querySelector('[data-id="' + id + '"]');
  }

  function getVisibleTasks() {
    return state.tasks.filter(function (task) {
      if (state.filter === 'active') return !task.completed;
      if (state.filter === 'completed') return task.completed;
      return true;
    });
  }

  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  /* 6. ACTIONS: each one changes state, then calls commit() -------------- */
  function commit(message) {
    var saved = storage.save(state.tasks);
    els.storageNote.hidden = saved;
    render();
    if (message) announce(message);
  }

  function addTask(text) {
    var task = { id: makeId(), text: text, completed: false, createdAt: Date.now() };
    state.tasks.unshift(task); // newest first
    newestId = task.id;
    if (state.filter === 'completed') state.filter = 'all'; // so the new task is visible
    commit('Task added');
  }

  function toggleTask(id) {
    var task = findTask(id);
    if (!task) return;
    task.completed = !task.completed;
    pendingFocus = { id: id, selector: '.task__check', fallback: '.filters [aria-pressed="true"]' };
    commit(task.completed ? 'Task marked completed' : 'Task marked active');
  }

  function startEdit(id) {
    state.editingId = id;
    pendingFocus = { id: id, selector: '.task__edit-input' };
    render();
  }

  function cancelEdit(id) {
    state.editingId = null;
    pendingFocus = { id: id, selector: '[data-action="edit"]' };
    render();
    announce('Edit cancelled');
  }

  function saveEdit(id, rawText, item) {
    var text = cleanText(rawText);
    var task = findTask(id);
    if (!task) return;

    // Blank edits are not allowed: show a message and stay in edit mode.
    if (!text) {
      var field = item.querySelector('.task__edit-input');
      item.querySelector('.field-error').hidden = false;
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      return;
    }

    state.editingId = null;
    pendingFocus = { id: id, selector: '[data-action="edit"]' };
    if (text === task.text) {
      render(); // nothing changed
      return;
    }
    task.text = text;
    commit('Task updated');
  }

  function removeTask(id, item) {
    if (item.classList.contains('task--leaving')) return; // already being removed

    // Work out where focus should go once this task is gone.
    var visible = getVisibleTasks();
    var index = visible.findIndex(function (task) { return task.id === id; });
    var neighbour = visible[index + 1] || visible[index - 1];
    pendingFocus = neighbour
      ? { id: neighbour.id, selector: '.task__check', fallback: '.filters [aria-pressed="true"]' }
      : { selector: '.filters [aria-pressed="true"]' };

    item.classList.add('task--leaving');
    window.setTimeout(function () {
      state.tasks = state.tasks.filter(function (task) { return task.id !== id; });
      if (state.editingId === id) state.editingId = null;
      commit('Task deleted');
    }, prefersReducedMotion() ? 0 : LEAVE_MS);
  }

  function clearCompleted() {
    var count = state.tasks.filter(function (task) { return task.completed; }).length;
    if (count === 0) return;
    state.tasks = state.tasks.filter(function (task) { return !task.completed; });
    state.editingId = null;
    pendingFocus = { selector: '.filters [aria-pressed="true"]' };
    commit('Cleared ' + plural(count, 'completed task', 'completed tasks'));
  }

  function setFilter(filter) {
    state.filter = filter;
    state.editingId = null;
    render();
    announce('Showing ' + filter + ' tasks');
  }

  /* 7. BUILDING TASK ELEMENTS (dynamic DOM creation) ----------------------- */
  function svgIcon(pathData, className) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    svg.appendChild(path);
    return svg;
  }

  function createIconButton(action, label, pathData) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn icon-btn--' + action;
    button.dataset.action = action;
    button.setAttribute('aria-label', label);
    button.title = action === 'edit' ? 'Edit' : 'Delete';
    button.appendChild(svgIcon(pathData, 'icon'));
    return button;
  }

  function createEditor(task) {
    var wrap = document.createElement('div');
    wrap.className = 'task__editor';

    var label = document.createElement('label');
    label.className = 'visually-hidden';
    label.htmlFor = 'edit-' + task.id;
    label.textContent = 'Edit task text';

    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'edit-' + task.id;
    input.className = 'task__edit-input';
    input.value = task.text;
    input.maxLength = MAX_LENGTH;
    input.autocomplete = 'off';

    var error = document.createElement('p');
    error.className = 'field-error';
    error.id = 'edit-error-' + task.id;
    error.setAttribute('role', 'alert');
    error.hidden = true;
    error.textContent = 'A task can’t be empty. Add some text or cancel.';
    input.setAttribute('aria-describedby', error.id);

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn--primary btn--sm';
    save.dataset.action = 'save';
    save.textContent = 'Save';

    var cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn--ghost btn--sm';
    cancel.dataset.action = 'cancel';
    cancel.textContent = 'Cancel';

    var row = document.createElement('div');
    row.className = 'task__editor-row';
    row.append(input, save, cancel);

    wrap.append(label, row, error);
    return wrap;
  }

  function createTaskElement(task) {
    var item = document.createElement('li');
    item.className = 'task';
    item.dataset.id = task.id;

    if (task.id === newestId) item.classList.add('task--new');

    // Edit mode: show the inline editor instead of the normal card.
    if (task.id === state.editingId) {
      item.classList.add('task--editing');
      item.appendChild(createEditor(task));
      return item;
    }

    if (task.completed) item.classList.add('task--done');

    // Checkbox (a real input, styled by the span next to it)
    var toggle = document.createElement('label');
    toggle.className = 'task__toggle';

    var check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'task__check';
    check.checked = task.completed;
    check.dataset.action = 'toggle';
    check.setAttribute('aria-label', task.text);

    var box = document.createElement('span');
    box.className = 'task__box';
    box.setAttribute('aria-hidden', 'true');
    box.appendChild(svgIcon('M5 12.5l4.5 4.5L19 7.5', 'task__tick'));

    toggle.append(check, box);

    // Text: textContent is used so typed text can never be treated as HTML
    var text = document.createElement('p');
    text.className = 'task__text';
    text.textContent = task.text;

    // Edit and delete buttons
    var actions = document.createElement('div');
    actions.className = 'task__actions';
    actions.append(
      createIconButton('edit', 'Edit “' + task.text + '”',
        'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4'),
      createIconButton('delete', 'Delete “' + task.text + '”',
        'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5')
    );

    item.append(toggle, text, actions);
    return item;
  }

  /* 8. RENDER: redraw the screen from the state ---------------------------- */
  function render() {
    var total = state.tasks.length;
    var done = state.tasks.filter(function (task) { return task.completed; }).length;
    var active = total - done;
    var counts = { all: total, active: active, completed: done };
    var visible = getVisibleTasks();

    // If the task being edited is no longer visible, leave edit mode.
    if (state.editingId && !visible.some(function (task) { return task.id === state.editingId; })) {
      state.editingId = null;
    }

    // The list
    els.list.replaceChildren.apply(els.list, visible.map(createTaskElement));
    els.list.hidden = visible.length === 0;

    // Filter buttons: highlight the selected one and show the counts
    els.filterButtons.forEach(function (button) {
      var name = button.dataset.filter;
      button.setAttribute('aria-pressed', String(name === state.filter));
      button.querySelector('.filters__count').textContent = counts[name];
    });

    // Empty states: show at most one
    var emptyKey = null;
    if (visible.length === 0) {
      if (total === 0) emptyKey = 'none';
      else emptyKey = state.filter === 'active' ? 'active' : 'completed';
    }
    els.empties.forEach(function (section) {
      section.hidden = section.dataset.empty !== emptyKey;
    });

    // Footer
    els.foot.hidden = total === 0;
    els.itemsLeft.textContent = plural(active, 'task', 'tasks') + ' left';
    els.clearCompleted.disabled = done === 0;

    // Summary card: ring and message
    var percent = total === 0 ? 0 : Math.round((done / total) * 100);
    els.progressBar.style.strokeDashoffset = String(RING_LENGTH * (1 - percent / 100));
    els.progressValue.textContent = percent + '%';
    els.progress.setAttribute('aria-label', percent + '% of tasks completed');

    if (total === 0) els.summary.textContent = 'Nothing planned yet.';
    else if (active === 0) els.summary.textContent = 'Everything is done. Nice work.';
    else els.summary.textContent = done + ' of ' + total + ' done, ' + active + ' to go.';

    newestId = null;
    applyPendingFocus();
  }

  function applyPendingFocus() {
    if (!pendingFocus) return;
    var request = pendingFocus;
    pendingFocus = null;

    var target = null;
    if (request.id) {
      var item = findItem(request.id);
      target = item ? item.querySelector(request.selector) : null;
    } else {
      target = document.querySelector(request.selector);
    }
    if (!target && request.fallback) target = document.querySelector(request.fallback);

    if (target) {
      target.focus();
      if (target.classList.contains('task__edit-input')) target.select();
    }
  }

  /* 9. EVENTS ------------------------------------------------------------- */

  // Add form: Enter key or the "Add task" button
  els.form.addEventListener('submit', function (event) {
    event.preventDefault();
    var text = cleanText(els.input.value);
    if (!text) {
      els.addError.hidden = false;
      els.input.setAttribute('aria-invalid', 'true');
      els.input.focus();
      return;
    }
    addTask(text);
    els.input.value = '';
    els.input.focus();
  });

  els.input.addEventListener('input', function () {
    els.addError.hidden = true;
    els.input.removeAttribute('aria-invalid');
  });

  // Filter buttons (one listener on the container)
  els.filters.addEventListener('click', function (event) {
    var button = event.target.closest('[data-filter]');
    if (button) setFilter(button.dataset.filter);
  });

  els.clearCompleted.addEventListener('click', clearCompleted);

  /* EVENT DELEGATION
     Task items are created and destroyed all the time, so instead of adding
     listeners to every button, we add ONE listener to the <ul>. When something
     inside is clicked, the event "bubbles up" to the list. We then read
     data-action on the clicked element to learn what the user wants. */
  els.list.addEventListener('click', function (event) {
    var control = event.target.closest('[data-action]');
    if (!control || !els.list.contains(control)) return;

    var item = control.closest('.task');
    if (!item) return;
    var id = item.dataset.id;

    switch (control.dataset.action) {
      case 'toggle':
        toggleTask(id);
        break;
      case 'edit':
        startEdit(id);
        break;
      case 'delete':
        removeTask(id, item);
        break;
      case 'save':
        saveEdit(id, item.querySelector('.task__edit-input').value, item);
        break;
      case 'cancel':
        cancelEdit(id);
        break;
    }
  });

  // Double-click a task's text to edit it
  els.list.addEventListener('dblclick', function (event) {
    var text = event.target.closest('.task__text');
    if (!text) return;
    startEdit(text.closest('.task').dataset.id);
  });

  // Keyboard inside the edit box: Enter saves, Escape cancels
  els.list.addEventListener('keydown', function (event) {
    var field = event.target.closest('.task__edit-input');
    if (!field || event.isComposing) return;

    var item = field.closest('.task');
    if (event.key === 'Enter') {
      event.preventDefault();
      saveEdit(item.dataset.id, field.value, item);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelEdit(item.dataset.id);
    }
  });

  // Hide the "can't be empty" message as soon as the person types again
  els.list.addEventListener('input', function (event) {
    var field = event.target.closest('.task__edit-input');
    if (!field) return;
    field.removeAttribute('aria-invalid');
    var message = field.closest('.task').querySelector('.field-error');
    if (message) message.hidden = true;
  });

  /* 9b. THEME SWITCH ------------------------------------------------------
     Until the person picks a theme, the page follows their device (light or dark).
     Once they use the switch, the choice is saved and written to <html data-theme="...">. */
  var THEME_KEY = 'daybook.theme';
  var themeButton = $('#theme-toggle');
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function getSavedTheme() {
    try {
      var value = window.localStorage.getItem(THEME_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch (error) {
      return null;
    }
  }

  function currentTheme() {
    var forced = document.documentElement.getAttribute('data-theme');
    if (forced === 'light' || forced === 'dark') return forced;
    return darkQuery && darkQuery.matches ? 'dark' : 'light';
  }

  function syncThemeButton() {
    themeButton.setAttribute('aria-checked', String(currentTheme() === 'dark'));
  }

  function initTheme() {
    var saved = getSavedTheme();
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    syncThemeButton();

    themeButton.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { window.localStorage.setItem(THEME_KEY, next); } catch (error) { /* storage blocked */ }
      syncThemeButton();
      announce(next === 'dark' ? 'Dark theme on' : 'Light theme on');
    });

    // If the person never chose a theme and changes their device setting, follow it
    if (darkQuery && darkQuery.addEventListener) {
      darkQuery.addEventListener('change', function () {
        if (!getSavedTheme()) syncThemeButton();
      });
    }
  }

  /* 10. START-UP ---------------------------------------------------------- */
  function init() {
    initTheme();

    els.date.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });

    var saved = storage.load(); // null on the very first visit
    if (saved !== null) {
      state.tasks = saved;
    } else if (SEED_FIRST_RUN) {
      state.tasks = SEED_TASKS.map(function (sample, index) {
        return {
          id: makeId(),
          text: sample.text,
          completed: sample.completed,
          createdAt: Date.now() - index
        };
      });
    }

    commit(); // saves the starting list and draws it
  }

  init();
})();
