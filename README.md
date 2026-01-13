# Project Hestia
![Preview](assets/preview.gif)
2.  Build and Run:

    ```bash
    docker build -t hestia-core .
    docker run -d -p 8080:80 --name hestia hestia-core
    ```

3.  Visit `http://localhost:8080`\!

### Option 2: Static / Manual

Since Hestia is vanilla JavaScript, you can run it on any web server.

```bash
# Example using Python
python3 -m http.server 8000
```
1.  **Create a file:** `js/apps/myApp.js`
2.  **Extend BaseApp:**

<!-- end list -->

```javascript
import { BaseApp } from "./baseApp.js";
import { registry } from "../registry.js";

class MyApp extends BaseApp {
    // 1. Render HTML
    async render(app) {
        return `
            <div class="my-app">
                Hello ${app.data.name || 'World'}!
            </div>
        `;
    }

    // 2. Logic after DOM insertion
    onMount(el, app) {
        console.log("I am alive!");
    }
}

// 3. Register
registry.register('my-app', MyApp, {
    label: 'My Cool App',
    category: 'static',
    defaultSize: { cols: 2, rows: 1 },
    settings: [
        { name: 'name', label: 'Who to greet?', type: 'text' }
    ],
    css: `.my-app { color: var(--brand-primary); font-weight: bold; }`
});
```

3.  **Import it:** Add `import './myApp.js';` to `js/apps/appIndex.js`.
