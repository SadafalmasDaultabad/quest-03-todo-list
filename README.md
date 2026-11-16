# Daybook: To-Do List (Thiranex Quest 3)

A to-do list built with plain HTML, CSS and JavaScript. No libraries and no build step.

## Files

| File | What it does |
| --- | --- |
| `index.html` | The page structure: summary card, add form, filter buttons, task list, empty states. |
| `style.css` | All the styling. Colours and fonts are defined once at the top (light and dark themes). |
| `script.js` | All the logic: state, localStorage, building task elements, event delegation. |

## Run it

1. Put the three files in the same folder.
2. Double-click `index.html`. It opens in your browser and works right away.

## Features (Quest 3 checklist)

- Create, read, update and delete tasks (full CRUD)
- Mark tasks completed or active
- Filter by All, Active and Completed, with live counts
- Tasks and their completed status save automatically with `window.localStorage` and come back after a reload
- Every task item is created with JavaScript (`document.createElement`)
- Event delegation: one click listener on the task list handles toggle, edit, delete, save and cancel
- Blank tasks are blocked when adding and when editing
- Keyboard friendly: Enter saves, Escape cancels an edit, double-click a task to edit it

## Where the Quest 3 ideas are in `script.js`

- **State:** section 2, the `state` object
- **localStorage:** section 4, `storage.load` and `storage.save`
- **Dynamic DOM elements:** section 7, `createTaskElement`
- **Rendering:** section 8, `render`
- **Event delegation:** section 9, the `els.list.addEventListener('click', ...)` block

## Optional setting

The first time the app opens it adds four sample tasks so the page is not empty. To start with an empty list instead, open `script.js` and change `SEED_FIRST_RUN = true` to `SEED_FIRST_RUN = false`.

## Put it online (free)

**Option A: Netlify Drop (about one minute, no account needed to try)**
1. Go to https://app.netlify.com/drop
2. Drag the whole folder (with all three files) onto the page.
3. Netlify gives you a public link.

**Option B: GitHub Pages**
1. Create a new public repository on GitHub and upload the three files.
2. In the repository, open Settings, then Pages.
3. Under "Build and deployment", choose "Deploy from a branch", pick `main` and `/ (root)`, then Save.
4. After a minute, your link appears at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.
