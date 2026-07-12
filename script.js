/* ===================================================================
   TaskFlow — To-Do List Application Logic
   Handles CRUD operations, filtering, sorting, search, persistence,
   dark mode, and all UI interactions.
   =================================================================== */

'use strict';

// ─── Constants ──────────────────────────────────────────────────────

/** Local Storage key for persisting tasks */
const STORAGE_KEY = 'taskflow_tasks';



/** Priority weight map used for sorting */
const PRIORITY_ORDER = { high: 3, medium: 2, low: 1 };

// ─── State ──────────────────────────────────────────────────────────

/** Master list of all tasks (array of task objects) */
let tasks = [];

/** Currently active filter: 'all' | 'active' | 'completed' */
let currentFilter = 'all';

/** Current sort order */
let currentSort = 'newest';

/** Current search query */
let searchQuery = '';

/** ID of the task pending deletion (used by the delete confirmation dialog) */
let pendingDeleteId = null;

// ─── DOM References ─────────────────────────────────────────────────
// Cached once at startup for performance.

const dom = {
  // Form
  addForm:         document.getElementById('add-task-form'),
  titleInput:      document.getElementById('task-title'),
  descInput:       document.getElementById('task-description'),
  dueDateInput:    document.getElementById('task-due-date'),
  priorityInput:   document.getElementById('task-priority'),
  categoryInput:   document.getElementById('task-category'),
  addBtn:          document.getElementById('add-task-btn'),
  titleError:      document.getElementById('title-error'),
  dateError:       document.getElementById('date-error'),
  notifyTimeInput: document.getElementById('task-notify-time'),
  notifyError:     document.getElementById('notify-error'),

  // List & states
  taskList:        document.getElementById('task-list'),
  emptyState:      document.getElementById('empty-state'),
  noResultsState:  document.getElementById('no-results-state'),

  // Progress
  statTotal:       document.getElementById('stat-total'),
  statCompleted:   document.getElementById('stat-completed'),
  statRemaining:   document.getElementById('stat-remaining'),
  progressBar:     document.getElementById('progress-bar'),
  progressText:    document.getElementById('progress-text'),

  // Toolbar
  searchInput:     document.getElementById('search-input'),
  sortSelect:      document.getElementById('sort-select'),
  filterBtns:      document.querySelectorAll('.filter-btn'),

  // Clear completed
  clearBtn:        document.getElementById('clear-completed-btn'),

  // Edit modal
  editModal:       document.getElementById('edit-modal'),
  editForm:        document.getElementById('edit-task-form'),
  editId:          document.getElementById('edit-task-id'),
  editTitle:       document.getElementById('edit-title'),
  editDescription: document.getElementById('edit-description'),
  editDueDate:     document.getElementById('edit-due-date'),
  editNotifyTime:  document.getElementById('edit-notify-time'),
  editPriority:    document.getElementById('edit-priority'),
  editCategory:    document.getElementById('edit-category'),
  editTitleError:  document.getElementById('edit-title-error'),
  editDateError:   document.getElementById('edit-date-error'),
  editNotifyError: document.getElementById('edit-notify-error'),
  editCancelBtn:   document.getElementById('edit-cancel-btn'),

  // Delete dialog
  deleteDialog:    document.getElementById('delete-dialog'),
  deleteTaskName:  document.getElementById('delete-task-name'),
  deleteCancelBtn: document.getElementById('delete-cancel-btn'),
  deleteConfirmBtn:document.getElementById('delete-confirm-btn'),

  // Clear dialog
  clearDialog:     document.getElementById('clear-dialog'),
  clearCancelBtn:  document.getElementById('clear-cancel-btn'),
  clearConfirmBtn: document.getElementById('clear-confirm-btn'),



  // Date-time display
  datetime:        document.getElementById('current-datetime'),

  // Theme and loader
  pageLoader:      document.getElementById('page-loader'),
  themeToggle:     document.getElementById('theme-toggle'),
};


// =====================================================================
// 1. PERSISTENCE  — Load / Save tasks to LocalStorage
// =====================================================================

/**
 * Loads tasks from LocalStorage into the `tasks` array.
 * Returns an empty array if no data is found or parsing fails.
 */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    tasks = raw ? JSON.parse(raw) : [];
  } catch {
    tasks = [];
  }
}

/**
 * Persists the current `tasks` array to LocalStorage as a JSON string.
 */
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}


// =====================================================================
// 2. TASK CRUD  — Create, Read, Update, Delete
// =====================================================================

/**
 * Creates a new task object with a unique ID and timestamps.
 *
 * @param {string} title       - The task title (required).
 * @param {string} description - An optional longer description.
 * @param {string} dueDate     - An optional ISO date string (yyyy-mm-dd).
 * @param {string} priority    - 'low' | 'medium' | 'high'.
 * @returns {Object} The new task object.
 */
function createTask(title, description, dueDate, notifyTime, priority, category) {
  return {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: description.trim(),
    dueDate: dueDate || null,
    notifyTime: notifyTime || null,
    priority: priority || 'medium',
    category: category || 'inbox',
    completed: false,
    notified: false,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Adds a task to the master list, saves, and re-renders.
 * Called when the "Add Task" form is submitted.
 */
function addTask(e) {
  e.preventDefault();

  const title = dom.titleInput.value.trim();

  // Validate: prevent empty titles
  if (!title) {
    dom.titleError.textContent = 'Please enter a task title.';
    dom.titleInput.focus();
    return;
  }

  dom.titleError.textContent = '';

  const dueDate = dom.dueDateInput.value;
  if (!dueDate) {
    dom.dateError.textContent = 'Please select a due date.';
    dom.dueDateInput.focus();
    return;
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(dueDate + 'T00:00:00');
    if (selectedDate < today) {
      dom.dateError.textContent = 'Due date cannot be in the past.';
      dom.dueDateInput.focus();
      return;
    }
  }
  dom.dateError.textContent = '';

  const notifyTime = dom.notifyTimeInput.value;
  if (notifyTime) {
    const selectedNotify = getNotifyDateTime(notifyTime, dueDate);
    if (!selectedNotify || selectedNotify < new Date()) {
      dom.notifyError.textContent = 'Notification time must be valid and not in the past.';
      dom.notifyTimeInput.focus();
      return;
    }
  }
  dom.notifyError.textContent = '';

  const task = createTask(
    title,
    dom.descInput.value,
    dom.dueDateInput.value,
    dom.notifyTimeInput.value,
    dom.priorityInput.value,
    dom.categoryInput.value,
  );

  tasks.unshift(task); // newest first
  saveTasks();
  showToast('Task added successfully', 'success');
  resetForm();
  render();
}

/**
 * Toggles the completed state of a task by its ID.
 * Adds a short flash animation on the task card.
 *
 * @param {string} id - The task ID.
 */
function toggleTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  task.completed = !task.completed;
  saveTasks();

  // Quick visual feedback before full re-render
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) {
    el.classList.add('completing');
    el.addEventListener('animationend', () => el.classList.remove('completing'), { once: true });
  }

  render();
}

/**
 * Opens the edit modal pre-filled with the task's current data.
 *
 * @param {string} id - The task ID.
 */
function openEditModal(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  dom.editId.value        = task.id;
  dom.editTitle.value     = task.title;
  dom.editDescription.value = task.description;
  dom.editDueDate.value   = task.dueDate || '';
  dom.editNotifyTime.value = task.notifyTime || '';
  dom.editPriority.value  = task.priority;
  dom.editCategory.value  = task.category || 'inbox';
  dom.editTitleError.textContent = '';
  dom.editDateError.textContent = '';
  dom.editNotifyError.textContent = '';

  // Update min date limits dynamically
  updateDateMin();

  dom.editModal.showModal();
}

/**
 * Saves the edited task data from the edit modal.
 */
function saveEditedTask(e) {
  e.preventDefault();

  const title = dom.editTitle.value.trim();
  if (!title) {
    dom.editTitleError.textContent = 'Title cannot be empty.';
    dom.editTitle.focus();
    return;
  }

  const dueDate = dom.editDueDate.value;
  if (!dueDate) {
    dom.editDateError.textContent = 'Due date cannot be empty.';
    dom.editDueDate.focus();
    return;
  } else {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(dueDate + 'T00:00:00');
    if (selectedDate < today) {
      dom.editDateError.textContent = 'Due date cannot be in the past.';
      dom.editDueDate.focus();
      return;
    }
  }
  dom.editDateError.textContent = '';

  const notifyTime = dom.editNotifyTime.value;
  if (notifyTime) {
    const selectedNotify = getNotifyDateTime(notifyTime, dueDate);
    if (!selectedNotify || selectedNotify < new Date()) {
      dom.editNotifyError.textContent = 'Notification time must be valid and not in the past.';
      dom.editNotifyTime.focus();
      return;
    }
  }
  dom.editNotifyError.textContent = '';

  const task = tasks.find(t => t.id === dom.editId.value);
  if (!task) return;

  task.title       = title;
  task.description = dom.editDescription.value.trim();
  task.dueDate     = dom.editDueDate.value || null;
  
  const oldNotifyTime = task.notifyTime;
  const newNotifyTime = notifyTime || null;
  if (newNotifyTime !== oldNotifyTime) {
    task.notifyTime = newNotifyTime;
    task.notified = false;
  }
  
  task.priority    = dom.editPriority.value;
  task.category    = dom.editCategory.value;

  saveTasks();
  showToast('Task updated successfully', 'success');
  dom.editModal.close();
  render();
}

/**
 * Opens the delete confirmation dialog for a specific task.
 *
 * @param {string} id - The task ID to potentially delete.
 */
function confirmDelete(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  pendingDeleteId = id;
  dom.deleteTaskName.textContent = task.title;
  dom.deleteDialog.showModal();
}

/**
 * Permanently removes the task identified by `pendingDeleteId`.
 * Plays a slide-out animation before removing the DOM element.
 */
function deleteTask() {
  if (!pendingDeleteId) return;

  const idToDelete = pendingDeleteId; // Capture ID before dialog close resets pendingDeleteId to null
  const el = document.querySelector(`[data-id="${idToDelete}"]`);
  if (el) {
    el.classList.add('removing');
    el.addEventListener('animationend', () => {
      tasks = tasks.filter(t => t.id !== idToDelete);
      saveTasks();
      showToast('Task deleted successfully', 'danger');
      render();
    }, { once: true });
  } else {
    // Fallback if DOM element not found
    tasks = tasks.filter(t => t.id !== idToDelete);
    saveTasks();
    showToast('Task deleted successfully', 'danger');
    render();
  }

  dom.deleteDialog.close();
}

/**
 * Removes all completed tasks after user confirmation.
 */
function clearCompletedTasks() {
  tasks = tasks.filter(t => !t.completed);
  saveTasks();
  dom.clearDialog.close();
  render();
}


// =====================================================================
// 3. FILTERING & SORTING
// =====================================================================

/**
 * Applies the current filter, search query, and sort order
 * to the master `tasks` array and returns the resulting subset.
 *
 * @returns {Object[]} Filtered and sorted task array.
 */
function getFilteredTasks() {
  let result = [...tasks];

  // ── Filter by status ──
  if (currentFilter === 'active') {
    result = result.filter(t => !t.completed);
  } else if (currentFilter === 'completed') {
    result = result.filter(t => t.completed);
  }

  // ── Search by title (case-insensitive) ──
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    result = result.filter(t => t.title.toLowerCase().includes(q));
  }

  // ── Sort ──
  result.sort((a, b) => {
    switch (currentSort) {
      case 'newest':
        return new Date(b.createdAt) - new Date(a.createdAt);
      case 'oldest':
        return new Date(a.createdAt) - new Date(b.createdAt);
      case 'due-date':
        // Tasks without a due date go to the end
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      case 'priority':
        return (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0);
      default:
        return 0;
    }
  });

  return result;
}


// =====================================================================
// 4. RENDERING  — Build the UI from state
// =====================================================================

/**
 * Main render function. Called after every state change.
 * Rebuilds the task list, updates progress stats and empty states.
 */
function render() {
  const filtered = getFilteredTasks();

  // ── Render task list ──
  dom.taskList.innerHTML = '';
  filtered.forEach(task => {
    dom.taskList.appendChild(buildTaskElement(task));
  });

  // ── Show/hide empty states ──
  const hasAny = tasks.length > 0;
  const hasResults = filtered.length > 0;

  dom.emptyState.hidden      = hasAny;
  dom.noResultsState.hidden  = !hasAny || hasResults;

  // ── Update progress ──
  updateProgress();

  // ── Update "Clear Completed" button state ──
  const completedCount = tasks.filter(t => t.completed).length;
  dom.clearBtn.disabled = completedCount === 0;
}

/**
 * Constructs a single task <li> element from a task object.
 *
 * @param {Object} task - A task object from the `tasks` array.
 * @returns {HTMLLIElement} The fully-built list item.
 */
function buildTaskElement(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.completed ? ' completed' : ''}`;
  li.setAttribute('data-id', task.id);

  // ── Checkbox ──
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'incomplete' : 'complete'}`);
  checkbox.addEventListener('change', () => toggleTask(task.id));

  // ── Content wrapper ──
  const content = document.createElement('div');
  content.className = 'task-content';

  // Title
  const title = document.createElement('span');
  title.className = 'task-title';
  title.textContent = task.title;
  content.appendChild(title);

  // Description (if present)
  if (task.description) {
    const desc = document.createElement('p');
    desc.className = 'task-description';
    desc.textContent = task.description;
    content.appendChild(desc);
  }

  // Meta tags (due date + priority)
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  if (task.dueDate) {
    const dueDateTag = document.createElement('span');
    dueDateTag.className = 'meta-tag due-date';

    // Check if overdue
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(task.dueDate + 'T00:00:00');
    if (due < today && !task.completed) {
      dueDateTag.classList.add('overdue');
    }

    dueDateTag.textContent = `📅 ${formatDate(task.dueDate)}`;
    meta.appendChild(dueDateTag);
  }

  const priorityTag = document.createElement('span');
  priorityTag.className = `meta-tag priority-${task.priority}`;
  priorityTag.textContent = `${getPriorityIcon(task.priority)} ${capitalize(task.priority)}`;
  meta.appendChild(priorityTag);

  if (task.category) {
    const categoryTag = document.createElement('span');
    categoryTag.className = `meta-tag category-${task.category}`;
    categoryTag.textContent = `🏷️ ${capitalize(task.category)}`;
    meta.appendChild(categoryTag);
  }

  if (!task.completed && task.notifyTime) {
    const notifyDate = getNotifyDateTime(task.notifyTime, task.dueDate);
    if (notifyDate) {
      const diff = notifyDate - new Date();
      const countdownTag = document.createElement('span');
      countdownTag.className = `meta-tag countdown${diff <= 0 ? ' overdue' : ''}`;
      countdownTag.setAttribute('data-notify-time', notifyDate.toISOString());
      countdownTag.setAttribute('data-task-id', task.id);
      countdownTag.textContent = getCountdownText(notifyDate.toISOString());
      meta.appendChild(countdownTag);
    }
  }

  content.appendChild(meta);

  // ── Action buttons ──
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'task-action-btn edit';
  editBtn.type = 'button';
  editBtn.innerHTML = '✏️';
  editBtn.setAttribute('aria-label', `Edit "${task.title}"`);
  editBtn.setAttribute('title', 'Edit task');
  editBtn.addEventListener('click', () => openEditModal(task.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'task-action-btn delete';
  deleteBtn.type = 'button';
  deleteBtn.innerHTML = '🗑️';
  deleteBtn.setAttribute('aria-label', `Delete "${task.title}"`);
  deleteBtn.setAttribute('title', 'Delete task');
  deleteBtn.addEventListener('click', () => confirmDelete(task.id));

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);

  // ── Assemble ──
  li.appendChild(checkbox);
  li.appendChild(content);
  li.appendChild(actions);

  return li;
}

/**
 * Updates the progress stats (total, completed, remaining) and progress bar.
 */
function updateProgress() {
  const total     = tasks.length;
  const completed = tasks.filter(t => t.completed).length;
  const remaining = total - completed;
  const pct       = total === 0 ? 0 : Math.round((completed / total) * 100);

  dom.statTotal.textContent     = total;
  dom.statCompleted.textContent = completed;
  dom.statRemaining.textContent = remaining;

  dom.progressBar.style.width = `${pct}%`;
  dom.progressText.textContent = `${pct}%`;

  // Toggle class for text visibility when bar is wide enough
  dom.progressBar.classList.toggle('has-progress', pct >= 12);

  // ARIA
  const container = dom.progressBar.parentElement;
  container.setAttribute('aria-valuenow', pct);
}





// =====================================================================
// 6. DATE & TIME DISPLAY
// =====================================================================

/**
 * Updates the header with the current date and time.
 * Called once and then every 30 seconds.
 */
function updateDateTime() {
  const now = new Date();

  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };

  dom.datetime.textContent = now.toLocaleDateString('en-US', options);
  dom.datetime.setAttribute('datetime', now.toISOString());
}


// =====================================================================
// 7. UTILITY HELPERS
// =====================================================================

/**
 * Formats an ISO date string (yyyy-mm-dd) into a human-friendly format.
 *
 * @param {string} dateStr - A date string in yyyy-mm-dd format.
 * @returns {string} Formatted date, e.g. "Jul 10, 2026".
 */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Returns an emoji icon corresponding to the task priority.
 *
 * @param {string} priority - 'low' | 'medium' | 'high'.
 * @returns {string} An emoji string.
 */
function getPriorityIcon(priority) {
  const icons = { low: '🟢', medium: '🟡', high: '🔴' };
  return icons[priority] || '⚪';
}

/**
 * Capitalises the first letter of a string.
 *
 * @param {string} str
 * @returns {string}
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Returns the current local date in yyyy-mm-dd format.
 *
 * @returns {string}
 */
function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalDateTimeString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Updates the min attribute of date inputs to prevent past date selection.
 */
function updateDateMin() {
  const todayStr = getLocalDateString();
  if (dom.dueDateInput) {
    dom.dueDateInput.min = todayStr;
  }
  if (dom.editDueDate) {
    dom.editDueDate.min = todayStr;
  }
  if (dom.notifyTimeInput) {
    dom.notifyTimeInput.min = '';
  }
  if (dom.editNotifyTime) {
    dom.editNotifyTime.min = '';
  }
}

function getCountdownText(notifyTime) {
  const diff = new Date(notifyTime) - new Date();
  if (diff > 0) {
    return `⏳ ${formatRemainingTime(diff)}`;
  } else {
    return `🔔 Time reached`;
  }
}

function formatRemainingTime(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const secs = totalSecs % 60;
  const totalMins = Math.floor(totalSecs / 60);
  const mins = totalMins % 60;
  const totalHours = Math.floor(totalMins / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (mins > 0 || hours > 0 || days > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

function getNotifyDateTime(notifyTime, dueDate) {
  if (!notifyTime) return null;
  const [hours, minutes] = notifyTime.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;

  if (dueDate) {
    const dateTime = new Date(`${dueDate}T${notifyTime}:00`);
    return Number.isNaN(dateTime.getTime()) ? null : dateTime;
  }

  const now = new Date();
  const selected = new Date(now);
  selected.setHours(hours, minutes, 0, 0);
  if (selected < now) {
    selected.setDate(selected.getDate() + 1);
  }
  return selected;
}

function updateCountdowns() {
  const elements = document.querySelectorAll('.meta-tag.countdown');
  let stateChanged = false;

  elements.forEach(el => {
    const notifyTimeStr = el.getAttribute('data-notify-time');
    const taskId = el.getAttribute('data-task-id');
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.completed) return;

    const diff = new Date(notifyTimeStr) - new Date();
    if (diff > 0) {
      el.textContent = `⏳ ${formatRemainingTime(diff)}`;
      el.className = 'meta-tag countdown';
    } else {
      el.textContent = `🔔 Time reached`;
      el.className = 'meta-tag countdown overdue';
      if (!task.notified) {
        task.notified = true;
        stateChanged = true;
        triggerNotification(task);
      }
    }
  });

  if (stateChanged) {
    saveTasks();
    render();
  }
}

function triggerNotification(task) {
  playNotificationSound();

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification("TaskFlow Reminder", {
        body: `Time to do: "${task.title}"`,
        icon: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="%236c5ce7"><text y="20">✦</text></svg>'
      });
    } catch (e) {
      console.error("Native notification failed", e);
    }
  }

  showToast(`Reminder: "${task.title}"`, 'info');
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {
    console.error("Audio playback failed", e);
  }
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  if (type === 'success') {
    icon.textContent = '✨';
  } else if (type === 'danger') {
    icon.textContent = '🗑️';
  } else {
    icon.textContent = '🔔';
  }

  const msg = document.createElement('div');
  msg.className = 'toast-message';
  msg.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  });

  toast.appendChild(icon);
  toast.appendChild(msg);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }
  }, 4000);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * Resets the "Add Task" form to its default state.
 */
function resetForm() {
  dom.addForm.reset();
  dom.titleError.textContent = '';
  dom.dateError.textContent = '';
  dom.notifyError.textContent = '';
  dom.titleInput.focus();
}


// =====================================================================
// 8. EVENT BINDING  — Wire up all interactions
// =====================================================================

function bindEvents() {

  // ── Add task ──
  dom.addForm.addEventListener('submit', addTask);

  // Clear validation error as user types
  dom.titleInput.addEventListener('input', () => {
    if (dom.titleInput.value.trim()) dom.titleError.textContent = '';
  });
  dom.dueDateInput.addEventListener('input', () => {
    dom.dateError.textContent = '';
  });
  dom.notifyTimeInput.addEventListener('input', () => {
    dom.notifyError.textContent = '';
  });
  dom.notifyTimeInput.addEventListener('focus', requestNotificationPermission);

  // ── Filter tabs ──
  dom.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      dom.filterBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      currentFilter = btn.dataset.filter;
      render();
    });
  });

  // ── Search ──
  dom.searchInput.addEventListener('input', () => {
    searchQuery = dom.searchInput.value.trim();
    render();
  });

  // ── Sort ──
  dom.sortSelect.addEventListener('change', () => {
    currentSort = dom.sortSelect.value;
    render();
  });



  // ── Clear completed ──
  dom.clearBtn.addEventListener('click', () => {
    dom.clearDialog.showModal();
  });

  dom.clearCancelBtn.addEventListener('click', () => dom.clearDialog.close());
  dom.clearConfirmBtn.addEventListener('click', clearCompletedTasks);

  // ── Edit modal ──
  dom.editForm.addEventListener('submit', saveEditedTask);
  dom.editCancelBtn.addEventListener('click', () => dom.editModal.close());

  // Clear validation error as user types
  dom.editTitle.addEventListener('input', () => {
    if (dom.editTitle.value.trim()) dom.editTitleError.textContent = '';
  });
  dom.editDueDate.addEventListener('input', () => {
    dom.editDateError.textContent = '';
  });
  dom.editNotifyTime.addEventListener('input', () => {
    dom.editNotifyError.textContent = '';
  });
  dom.editNotifyTime.addEventListener('focus', requestNotificationPermission);

  // ── Delete dialog ──
  dom.deleteCancelBtn.addEventListener('click', () => {
    pendingDeleteId = null;
    dom.deleteDialog.close();
  });
  dom.deleteConfirmBtn.addEventListener('click', deleteTask);

  // ── Close modals on backdrop click ──
  [dom.editModal, dom.deleteDialog, dom.clearDialog].forEach(dialog => {
    dialog.addEventListener('click', (e) => {
      // If the click target is the dialog itself (not a child), it's on the backdrop
      if (e.target === dialog) {
        dialog.close();
        pendingDeleteId = null;
      }
    });
  });

  // ── Close modals on Escape key ──
  // <dialog> natively supports Escape, but we reset pendingDeleteId
  dom.deleteDialog.addEventListener('close', () => {
    pendingDeleteId = null;
  });

  // ── Theme toggle ──
  if (dom.themeToggle) {
    dom.themeToggle.addEventListener('click', toggleTheme);
  }
}

// =====================================================================
// 10. THEME HANDLING
// =====================================================================

const THEME_KEY = 'taskflow_theme';

/**
 * Initializes the theme based on local storage or system preference.
 */
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  } else if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
  } else {
    // Respect system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      document.body.classList.add('dark-theme');
    }
  }
}

/**
 * Toggles between light and dark theme and persists it.
 */
function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-theme');
  localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
}

// =====================================================================
// 9. INITIALISATION
// =====================================================================

/**
 * Bootstraps the entire application:
 * 1. Applies the saved theme.
 * 2. Loads tasks from LocalStorage.
 * 3. Binds all event listeners.
 * 4. Renders the initial UI.
 * 5. Starts the date/time clock.
 */
function init() {
  initTheme();
  loadTasks();
  bindEvents();
  updateDateMin();
  render();

  // Display current date/time and refresh every 30s
  updateDateTime();
  setInterval(updateDateTime, 30000);
  
  // Start countdown ticks and notification checks
  setInterval(updateCountdowns, 1000);

  // Hide the page loader
  if (dom.pageLoader) {
    setTimeout(() => {
      dom.pageLoader.classList.add('fade-out');
    }, 300);
  }
}

// Kick everything off once the DOM is ready
document.addEventListener('DOMContentLoaded', init);
