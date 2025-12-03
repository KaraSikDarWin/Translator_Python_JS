import { useState } from "react";
import { tokenize } from "./Tokenizer";
import { parse } from "./Parser";
import { generateJS } from "./Generator";
import { Editor } from "@monaco-editor/react";

function Areas(){
    const [pythonCode, setPythonCode] = useState("");
    const [jsCode, setJScode] = useState("");
    const [consolelog, setconsolelog] = useState("");

    const handleCodeChange = (event) => {
        setPythonCode(event.target.value);
    };

    const translate = ()=>{
        try{
        const tokens = tokenize(pythonCode);
        const ast = parse(tokens);
        const trans = generateJS(ast);
        setJScode(trans);
        setconsolelog(consolelog+"Транляция прошла успешно"+"\n");
        
        }catch (error){
            setJScode("ОШИБКА ТРАНСЛЯЦИИ");
            setconsolelog(consolelog+error.message+"\n");
            
        }
    }

    return (
        <>
         
        <textarea value={pythonCode} onChange={handleCodeChange} placeholder="Введите код на Python" onBlur={handleCodeChange}></textarea>
        <textarea value={jsCode} placeholder="Тут будет ваш JavaScript код" readOnly></textarea>
        <p>
            <button onClick={translate}>Транслировать</button>
        </p>
        <h3>Консоль вывода</h3>
        <p>
            <textarea value={consolelog}></textarea>
        </p>
       
    
        </>
        
    )
}
export default Areas