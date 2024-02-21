// 给定文本，创建一个文本节点
function createTextNode(text) {
    return {
        type: "TEXT_ELEMENT", props: {
            nodeValue: text, children: []
        }
    };
}

// 创建虚拟DOM节点
function createElement(type, props, ...children) {
    return {
        type, props: {
            ...props, children: children.map((child) => {
                // 判断要创建的是否是文本节点
                const isTextNode = typeof child === "string" || typeof child === "number";
                return isTextNode ? createTextNode(child) : child;
            })
        }
    };
}

// 开始渲染
function render(el, container) {
    // Root Fiber
    wipRoot = {
        dom: container, props: {
            children: [el]
        }
    };
    nextWorkOfUnit = wipRoot;
}

// 正在进行的渲染
let wipRoot = null;
// 上次渲染
let currentRoot = null;
let nextWorkOfUnit = null;
// 要删除的fiber
let deletions = [];
let wipFiber = null;

// 调度
function workLoop(deadline) {
    // shouldYield 表示线程繁忙，应该中断渲染
    let shouldYield = false;
    while (!shouldYield && nextWorkOfUnit) {
        nextWorkOfUnit = performWorkOfUnit(nextWorkOfUnit);
        if (wipRoot?.sibling?.type === nextWorkOfUnit?.type) {
            nextWorkOfUnit = undefined;
        }
        // 检查线程是否繁忙
        shouldYield = deadline.timeRemaining() < 1;
    }
    if (!nextWorkOfUnit && wipRoot) {
        commitRoot();
    }
    // 重新请求，请求在空闲时执行渲染
    requestIdleCallback(workLoop);
}

// 渲染Root
// 问题：中途有可能没有空余时间，用户会看到渲染一半的dom
// 解决思路：计算结束后统一添加到屏幕里
function commitRoot() {
    deletions.forEach(commitDeletion);
    commitWork(wipRoot.child);
    commitEffectHooks();
    // commit完成后，把wipRoot变为currentRoot
    currentRoot = wipRoot;
    wipRoot = null;
    deletions = [];
}

function commitEffectHooks() {
    function run(fiber) {
        if (!fiber) return;
        if (!fiber.alternate) {
            // init
            fiber.effectHooks?.forEach((hook) => {
                hook.cleanup = hook.callback();
            });
        } else {
            // update
            // deps 有没有发生改变
            fiber.effectHooks?.forEach((newHook, index) => {
                if (newHook.deps.length > 0) {
                    const oldEffectHook = fiber.alternate?.effectHooks[index];
                    // some
                    const needUpdate = oldEffectHook?.deps.some((oldDep, i) => {
                        return oldDep !== newHook.deps[i];
                    });
                    needUpdate && (newHook.cleanup = newHook.callback());
                }
            });
        }
        run(fiber.child);
        run(fiber.sibling);
    }

    function runCleanup(fiber) {
        if (!fiber) return;
        fiber.alternate?.effectHooks?.forEach((hook) => {
            if (hook.deps.length > 0) {
                hook.cleanup && hook.cleanup();
            }
        });
        runCleanup(fiber.child);
        runCleanup(fiber.sibling);
    }

    runCleanup(wipRoot);
    run(wipRoot);
}

function commitDeletion(fiber) {
    if (fiber.dom) {
        let fiberParent = fiber.parent;
        while (!fiberParent.dom) {
            fiberParent = fiberParent.parent;
        }
        fiberParent.dom.removeChild(fiber.dom);
    } else {
        commitDeletion(fiber.child);
    }
}

// 渲染fiber
function commitWork(fiber) {
    if (!fiber) return;
    // 寻找最近的父DOM节点
    let fiberParent = fiber.parent;
    while (!fiberParent.dom) {
        fiberParent = fiberParent.parent;
    }
    if (fiber.effectTag === "update") {
        // dom，之前的props，现在的props
        updateProps(fiber.dom, fiber.props, fiber.alternate?.props);
    } else if (fiber.effectTag === "placement") {
        if (fiber.dom) {
            fiberParent.dom.append(fiber.dom);
        }
    }
    commitWork(fiber.child);
    commitWork(fiber.sibling);
}

function createDom(type) {
    return type === "TEXT_ELEMENT" ? document.createTextNode("") : document.createElement(type);
}

let eventId = 1;

// diff
function updateProps(dom, nextProps, prevProps) {
    // 1. old 有  new 没有 删除
    Object.keys(prevProps).forEach((key) => {
        if (key !== "children") {
            if (!(key in nextProps)) {
                dom.removeAttribute(key);
            }
        }
    });
    // 2. new 有 old 没有 添加
    // 3. new 有 old 有 修改
    Object.keys(nextProps).forEach((key) => {
        if (key !== "children") {
            if (nextProps[key] !== prevProps[key]) {
                // 处理事件绑定
                if (key.startsWith("on")) {
                    const eventType = key.slice(2).toLowerCase();
                    if (prevProps[key] && prevProps[key].id) {
                        console.log("prev eventId: ", prevProps[key].id);
                    }
                    dom.removeEventListener(eventType, prevProps[key]);
                    if (!nextProps[key].id) {
                        nextProps[key].id = eventId;
                        console.log("current eventId: ", nextProps[key].id);
                        eventId++;
                    }
                    dom.addEventListener(eventType, nextProps[key]);
                } else {
                    dom[key] = nextProps[key];
                }
            }
        }
    });
}

// diff
function reconcileChildren(fiber, children) {
    // 如果有alternate，就返回它的child，没有，就返回undefined
    let oldFiber = fiber.alternate?.child;
    let prevChild = null;
    children.forEach((child, index) => {
        const isSameType = oldFiber && oldFiber.type === child.type;
        let newFiber;
        if (isSameType) {
            // 更新
            newFiber = {
                type: child.type, props: child.props, child: null, parent: fiber, sibling: null, // 继承dom
                dom: oldFiber.dom, effectTag: "update", alternate: oldFiber
            };
        } else {
            if (child) {
                // 新建
                newFiber = {
                    type: child.type,
                    props: child.props,
                    child: null,
                    parent: fiber,
                    sibling: null,
                    dom: null,
                    effectTag: "placement"
                };
            }
            if (oldFiber) {
                // 删除
                deletions.push(oldFiber);
            }
        }
        if (oldFiber) {
            // 下一个oldFiber
            oldFiber = oldFiber.sibling;
        }
        // 第一个child才可以作为child，其他的就是sibling
        if (index === 0) {
            fiber.child = newFiber;
        } else {
            prevChild.sibling = newFiber;
        }
        if (newFiber) {
            prevChild = newFiber;
        }
    });
    while (oldFiber) {
        deletions.push(oldFiber);
        oldFiber = oldFiber.sibling;
    }
}

// 处理函数式组件
function updateFunctionComponent(fiber) {
    stateHookIndex = 0;
    effectHooks = [];
    wipFiber = fiber;
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber, children);
}

// 处理非函数式组件
function updateHostComponent(fiber) {
    // 新建DOM元素
    if (!fiber.dom) {
        const dom = (fiber.dom = createDom(fiber.type));
        updateProps(dom, fiber.props, {});
    }
    const children = fiber.props.children;
    reconcileChildren(fiber, children);
}

// 执行一个渲染任务单元，并返回新的任务
// 实现fiber架构
// 怎么做到每次只渲染几个节点呢？并且在下次执行的时候依然从之前的位置实行
// 把树结构转变成链表结构
// 该方法实现：
// 1 创建DOM
// 2 把DOM添加到父级容器里面
// 3 设置DOM的props
// 4 建立树上各节点之间的关系
// 5 返回下一个节点
function performWorkOfUnit(fiber) {
    // 是否为函数式组件
    const isFunctionComponent = typeof fiber.type === "function";
    if (isFunctionComponent) {
        updateFunctionComponent(fiber);
    } else {
        // 正常
        updateHostComponent(fiber);
    }
    // 如果有child，就返回child fiber
    // 返回下一个要执行的任务
    if (fiber.child) {
        return fiber.child;
    }
    // 没有就优先返回兄弟，向上查找
    // 如果没有，就不返回，返回值为undefined
    let nextFiber = fiber;
    while (nextFiber) {
        // 有sibling
        if (nextFiber.sibling) return nextFiber.sibling;
        // 向上查找
        nextFiber = nextFiber.parent;
    }
}

// dom树特别大导致渲染卡顿，把大任务拆分到多个task里面完成，使用分帧运算来实现任务调度器
requestIdleCallback(workLoop);

// 优化更新子组件的时候其他不相干的组件也会重新执行，造成浪费
function update() {
    let currentFiber = wipFiber;
    return () => {
        wipRoot = {
            ...currentFiber, alternate: currentFiber
        };
        nextWorkOfUnit = wipRoot;
    };
}

let stateHookIndex;

function useState(initial) {
    let currentFiber = wipFiber;
    // 旧hook
    const oldHook = currentFiber.alternate?.stateHooks[stateHookIndex];
    // 新hook
    const stateHook = {
        state: oldHook ? oldHook.state : initial, queue: oldHook ? oldHook.queue : []
    };
    // 批量执行action，并且更新state
    stateHook.queue.forEach((action) => {
        stateHook.state = action(stateHook.state);
    });
    stateHook.queue = [];
    if (!currentFiber.stateHooks) {
        currentFiber.stateHooks = [];
    }

    currentFiber.stateHooks[stateHookIndex] = stateHook;

    stateHookIndex++;

    function setState(action) {
        // 提前检测 减少不必要的更新
        const eagerState = typeof action === "function" ? action(stateHook.state) : action;
        if (eagerState === stateHook.state) return;
        stateHook.queue.push(typeof action === "function" ? action : () => action);
        // 重新设定wipRoot，触发渲染更新
        // 重新render
        wipRoot = {
            ...currentFiber, alternate: currentFiber
        };
        nextWorkOfUnit = wipRoot;
    }

    return [stateHook.state, setState];
}

let effectHooks;

// useEffect调用时机是在React完成对DOM的渲染之后，并且浏览器完成绘制之前
// cleanup在调用useEffect之前进行调用，当deps为空的时候不会调用返回的cleanup
function useEffect(callback, deps) {
    const effectHook = {
        callback, deps, cleanup: undefined
    };
    effectHooks.push(effectHook);
    wipFiber.effectHooks = effectHooks;
}

const React = {
    update, useEffect, useState, render, createElement
};

export default React;
