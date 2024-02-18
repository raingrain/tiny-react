import React from "./core/React.js";

function Test() {
    console.log("I am the Test Component");

    const [count, setCount] = React.useState(10);
    const [test, setTest] = React.useState("Test");

    function handleClick() {
        setCount((c) => c + 1);
        setTest(() => "Test");
    }

    React.useEffect(() => {
        console.log("init");
        return () => {
            console.log("cleanup 0");
        };
    }, []);

    React.useEffect(() => {
        console.log("update", count);
        return () => {
            console.log("cleanup 1");
        };
    }, [count]);

    React.useEffect(() => {
        console.log("update", count);
        return () => {
            console.log("cleanup 2");
        };
    }, [count]);

    return (
        <div>
            <div>{test}</div>
            <button onClick={handleClick}>{count}</button>
        </div>
    );
}

function App() {
    return (
        <div>
            <h1>Hello, mini-react!</h1>
            <Test></Test>
        </div>
    );
}

export default App;
