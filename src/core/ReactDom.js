import React from "./React.js";

// 同react18API，将传入组件挂载到所绑定的根节点上
const ReactDOM = {
    createRoot(container) {
        return {
            render(App) {
                React.render(App, container);
            }
        };
    }
};

export default ReactDOM;
