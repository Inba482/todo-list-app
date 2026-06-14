/**
 * ==========================================================================
 * STATE MANAGEMENT
 * ==========================================================================
 * The application follows a single source of truth (state-driven approach).
 * The UI is a direct reflection of this state. Whenever the state changes:
 *   1. We sync the state data to browser localStorage.
 *   2. We trigger a re-render of the DOM elements.
 */
const state = {
  // Array of task objects: { id: string, text: string, completed: boolean }
  tasks: [],
  
  // Active filter tab: 'all' | 'active' | 'completed'
  filter: 'all',
  
  // ID of the task currently in inline edit mode (null if none)
  editingTaskId: null
};

// SVG Icon templates used in dynamic DOM generation
const ICONS = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  edit: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
  save: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  cancel: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
};

/* ==========================================================================
   LOCALSTORAGE LOGIC
   ==========================================================================
   Synchronizes local changes with window.localStorage to persist data
   across page refreshes.
 */
const STORAGE_KEY = 'taskflow_todos';

/**
 * Loads tasks from localStorage and populates the state.
 */
function loadFromStorage() {
  try {
    const rawData = localStorage.getItem(STORAGE_KEY);
    state.tasks = rawData ? JSON.parse(rawData) : [];
  } catch (error) {
    console.error('Failed to parse tasks from localStorage:', error);
    state.tasks = [];
  }
}

/**
 * Saves the current tasks state to localStorage.
 */
function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (error) {
    console.error('Failed to write tasks to localStorage:', error);
  }
}

/* ==========================================================================
   CRUD OPERATIONS
   ==========================================================================
   Core logic that creates, reads, updates, and deletes items from state.
 */

/**
 * Create: Adds a new task to the list state.
 * @param {string} text - The content of the new task.
 */
function createTask(text) {
  const newTask = {
    id: 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
    text: text.trim(),
    completed: false
  };
  state.tasks.unshift(newTask); // Add to the beginning of the list
  saveToStorage();
  render();
}

/**
 * Update (Complete Toggle): Swaps completion flag on a task.
 * @param {string} id - The ID of the task.
 */
function toggleTaskCompletion(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveToStorage();
    render();
  }
}

/**
 * Update (Text Edit): Saves new text to an existing task.
 * @param {string} id - The ID of the task.
 * @param {string} newText - The updated text content.
 */
function updateTaskText(id, newText) {
  const trimmed = newText.trim();
  if (trimmed === '') {
    showValidationToast('Task text cannot be empty!');
    return;
  }
  
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    task.text = trimmed;
    state.editingTaskId = null; // Exit edit mode
    saveToStorage();
    render();
  }
}

/**
 * Delete: Removes a task from the list state.
 * @param {string} id - The ID of the task.
 */
function deleteTask(id) {
  state.tasks = state.tasks.filter(t => t.id !== id);
  // Reset editing mode if we deleted the task being edited
  if (state.editingTaskId === id) {
    state.editingTaskId = null;
  }
  saveToStorage();
  render();
}

/**
 * Delete (Bulk): Clears all completed tasks.
 */
function clearCompletedTasks() {
  const completedCount = state.tasks.filter(t => t.completed).length;
  if (completedCount === 0) return;
  
  // We can apply fade-out classes to items about to be cleared for standard visual parity
  const listItems = document.querySelectorAll('.todo-item.completed');
  listItems.forEach(item => item.classList.add('fade-out'));
  
  // Wait for the transition to finish before updating state
  setTimeout(() => {
    state.tasks = state.tasks.filter(t => !t.completed);
    saveToStorage();
    render();
  }, 300);
}

/* ==========================================================================
   RENDERING & DOM GENERATION
   ==========================================================================
   Generates DOM elements dynamically from the state array.
 */

// Helper to escape HTML characters to prevent XSS vulnerability
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

/**
 * Renders the page components dynamically based on current state.
 */
function render() {
  const todoList = document.getElementById('todoList');
  const emptyState = document.getElementById('emptyState');
  
  // 1. FILTERING LOGIC
  // Filter state.tasks array into a local array based on the selected filter
  const filteredTasks = state.tasks.filter(task => {
    if (state.filter === 'active') return !task.completed;
    if (state.filter === 'completed') return task.completed;
    return true; // 'all'
  });

  // 2. TOGGLE EMPTY STATE VIEW
  if (filteredTasks.length === 0) {
    emptyState.classList.remove('hidden');
    todoList.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    todoList.classList.remove('hidden');
  }

  // 3. GENERATE LIST DYNAMICALLY
  todoList.innerHTML = '';
  filteredTasks.forEach(task => {
    const isEditing = task.id === state.editingTaskId;
    
    // Create container <li>
    const li = document.createElement('li');
    li.className = `todo-item ${task.completed ? 'completed' : ''} ${isEditing ? 'editing' : ''}`;
    li.setAttribute('data-id', task.id);
    
    // Construct task inner template
    li.innerHTML = `
      <!-- Standard view elements -->
      <label class="checkbox-wrapper">
        <input type="checkbox" ${task.completed ? 'checked' : ''} aria-label="Mark task as complete">
        <span class="custom-checkbox">${ICONS.check}</span>
      </label>
      
      <span class="task-text" title="Double click to edit">${escapeHTML(task.text)}</span>
      
      <div class="task-actions">
        <button class="action-btn edit-btn" aria-label="Edit Task">
          ${ICONS.edit}
        </button>
        <button class="action-btn delete-btn" aria-label="Delete Task">
          ${ICONS.trash}
        </button>
      </div>

      <!-- Inline edit mode elements -->
      <div class="edit-input-wrapper">
        <input type="text" class="edit-text-input" value="${escapeHTML(task.text)}" aria-label="Edit task text" maxlength="120">
        <div class="edit-actions">
          <button class="action-btn save-btn" aria-label="Save changes">
            ${ICONS.save}
          </button>
          <button class="action-btn cancel-btn" aria-label="Cancel editing">
            ${ICONS.cancel}
          </button>
        </div>
      </div>
    `;

    todoList.appendChild(li);

    // If this item is currently editing, auto-focus input
    if (isEditing) {
      const editInput = li.querySelector('.edit-text-input');
      editInput.focus();
      // Move cursor to the end of the text
      const len = editInput.value.length;
      editInput.setSelectionRange(len, len);
    }
  });

  // 4. UPDATE STATISTICS HEADER
  updateStats();
  
  // 5. ADJUST SLIDING FILTER SELECTION HIGHLIGHT
  updateFilterSlider();
}

/**
 * Calculates stats and updates progress bar and counters.
 */
function updateStats() {
  const totalCount = state.tasks.length;
  const activeCount = state.tasks.filter(t => !t.completed).length;
  const completedCount = state.tasks.filter(t => t.completed).length;
  
  // Update task counter
  const counterEl = document.getElementById('taskCounter');
  if (activeCount === 1) {
    counterEl.textContent = '1 active task';
  } else {
    counterEl.textContent = `${activeCount} active tasks`;
  }
  
  // Calculate completion percentage
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  
  // Update DOM Progress Elements
  document.getElementById('progressPercent').textContent = `${percent}% Completed`;
  document.getElementById('progressBar').style.width = `${percent}%`;
}

/**
 * Slides the active filter tab highlighted pill to the correct position.
 */
function updateFilterSlider() {
  const activeBtn = document.querySelector(`.filter-btn[data-filter="${state.filter}"]`);
  const slider = document.getElementById('filterSlider');
  if (activeBtn && slider) {
    slider.style.width = `${activeBtn.offsetWidth}px`;
    slider.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
  }
}

/* ==========================================================================
   INPUT VALIDATION & UI FEEDBACK
   ========================================================================== */
let toastTimeout = null;

/**
 * Triggers the visual slide-down toast notification for validation errors.
 * @param {string} msg - The error message to show.
 */
function showValidationToast(msg) {
  const toast = document.getElementById('validationToast');
  toast.textContent = msg;
  toast.classList.add('show');
  
  // Clean up any existing auto-dismiss schedules
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  // Set dismiss timer
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

/* ==========================================================================
   EVENT DELEGATION & EVENT HANDLERS
   ==========================================================================
   Use target delegation for task lists to handle clicks on dynamically 
   generated buttons (edit, delete, checkbox click).
 */

/**
 * Initializes the event delegation and form submission bindings.
 */
function initEvents() {
  const todoForm = document.getElementById('todoForm');
  const todoInput = document.getElementById('todoInput');
  const todoList = document.getElementById('todoList');
  const clearCompletedBtn = document.getElementById('clearCompletedBtn');
  const filterTabs = document.querySelector('.filter-tabs');

  // Set the current date in the header
  const dateDisplay = document.getElementById('dateDisplay');
  const options = { weekday: 'long', month: 'short', day: 'numeric' };
  dateDisplay.textContent = new Date().toLocaleDateString('en-US', options);

  // Form Submission: Create a Task
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = todoInput.value.trim();
    
    if (value === '') {
      showValidationToast('Please enter a valid, non-empty task!');
      return;
    }
    
    createTask(value);
    todoInput.value = ''; // Reset input
  });

  // FILTER TABS EVENT DELEGATION
  filterTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    
    // De-activate old active button
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    
    // Activate clicked button
    btn.classList.add('active');
    
    // Set state filter and re-render
    state.filter = btn.dataset.filter;
    render();
  });

  // Clear Completed Tasks
  clearCompletedBtn.addEventListener('click', () => {
    clearCompletedTasks();
  });

  // TASK CONTAINER CLICK EVENT DELEGATION
  // Handles click events for checkboxes, edit toggling, deleting, saving edits, and canceling edits.
  todoList.addEventListener('click', (e) => {
    const target = e.target;
    const itemRow = target.closest('.todo-item');
    if (!itemRow) return;
    
    const taskId = itemRow.dataset.id;

    // 1. Completion Checkbox Toggle
    if (target.closest('.checkbox-wrapper input[type="checkbox"]')) {
      toggleTaskCompletion(taskId);
      return;
    }

    // 2. Edit Action Button
    if (target.closest('.edit-btn')) {
      state.editingTaskId = taskId;
      render();
      return;
    }

    // 3. Delete Action Button (with fade-out transition)
    if (target.closest('.delete-btn')) {
      // Add animation class
      itemRow.classList.add('fade-out');
      // Wait for transition to complete before triggering state removal
      itemRow.addEventListener('transitionend', () => {
        deleteTask(taskId);
      }, { once: true });
      
      // Fallback timeout in case transition event fails
      setTimeout(() => {
        if (state.tasks.some(t => t.id === taskId)) {
          deleteTask(taskId);
        }
      }, 350);
      return;
    }

    // 4. Save Edit Button
    if (target.closest('.save-btn')) {
      const editInput = itemRow.querySelector('.edit-text-input');
      if (editInput) {
        updateTaskText(taskId, editInput.value);
      }
      return;
    }

    // 5. Cancel Edit Button
    if (target.closest('.cancel-btn')) {
      state.editingTaskId = null;
      render();
      return;
    }
  });

  // DOUBLE-CLICK TASK TEXT EVENT DELEGATION
  // Double-clicking the task text initiates inline edit mode.
  todoList.addEventListener('dblclick', (e) => {
    const target = e.target;
    if (target.classList.contains('task-text')) {
      const itemRow = target.closest('.todo-item');
      if (itemRow) {
        state.editingTaskId = itemRow.dataset.id;
        render();
      }
    }
  });

  // TASK INLINE EDIT KEYDOWN DELEGATION
  // Inside the editing input field, support pressing 'Enter' to save, or 'Escape' to cancel.
  todoList.addEventListener('keydown', (e) => {
    const target = e.target;
    if (target.classList.contains('edit-text-input')) {
      const itemRow = target.closest('.todo-item');
      if (!itemRow) return;
      const taskId = itemRow.dataset.id;

      if (e.key === 'Enter') {
        e.preventDefault();
        updateTaskText(taskId, target.value);
      } else if (e.key === 'Escape') {
        state.editingTaskId = null;
        render();
      }
    }
  });

  // Window Resize: Readjust filter slider offset position
  window.addEventListener('resize', updateFilterSlider);
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Load tasks from storage
  loadFromStorage();
  
  // Attach all event listeners
  initEvents();
  
  // Initial render of the app
  render();
});
