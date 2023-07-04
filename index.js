document.getElementById("send").disabled = true;

const BLOCK_MAP = {
    "player_action": {"name": "PLAYER ACTION", "start": false, "newline":  true},
    "if_player":     {"name": "IF PLAYER",     "start": false, "newline": false},
    "start_process": {"name": "START PROCESS", "start": false, "newline":  true},
    "call_func":     {"name": "CALL FUNCTION", "start": false, "newline":  true},
    "control":       {"name": "CONTROL",       "start": false, "newline":  true},
    "set_var":       {"name": "SET VARIABLE",  "start": false, "newline":  true},
    "entity_event":  {"name": "ENTITY EVENT",  "start":  true, "newline":  true},
    "event":         {"name": "PLAYER EVENT",  "start":  true, "newline":  true},
    "func":          {"name": "FUNCTION",      "start":  true, "newline":  true},
    "if_entity":     {"name": "IF ENTITY",     "start": false, "newline": false},
    "entity_action": {"name": "ENTITY ACTION", "start": false, "newline":  true},
    "if_var":        {"name": "IF VARIABLE",   "start": false, "newline": false},
    "select_obj":    {"name": "SELECT OBJECT", "start": false, "newline":  true},
    "game_action":   {"name": "GAME ACTION",   "start": false, "newline":  true},
    "process":       {"name": "PROCESS",       "start":  true, "newline":  true},
    "repeat":        {"name": "REPEAT",        "start": false, "newline": false},
    "if_game":       {"name": "IF GAME",       "start": false, "newline": false}
};

let INVERSE_MAP = {};

for (let block of Object.entries(BLOCK_MAP)) {
    INVERSE_MAP[block[1].name] = block[0];
}


// Load ace editor into div#code
const editor = ace.edit("code");
const textArea = document.getElementById("data");
editor.setTheme("ace/theme/twilight");
editor.setOptions({
    fontFamily: "JetBrains Mono",
    fontSize: "1em"
});
const session = editor.getSession();
// Two-way binding
let aceCallback = () => {
    let code = session.getValue();
    let rawData = convertCode(code);
    textArea.value = rawData;
};
textArea.addEventListener("input", () => {
    let rawData = textArea.value;
    let code = convertRawData(rawData);
    // Prevent session.setValue() from triggering "change" event
    session.off("change", aceCallback);
    session.setValue(code);
    session.on("change", aceCallback);

});
session.on("change", aceCallback);

// Now, here's the "fun" part

// Convert raw data to code
function convertRawData(rawData) {
    try {
        if (rawData[0] !== "H") {
            let codeAndMetadata = JSON.parse(rawData.slice(1, -1));
            rawData = codeAndMetadata.code;
        }
        let code = pako.inflate(atob(rawData), {to: "string"});
        //return code;
        code = JSON.parse(code);
        console.dir(code);
        let blocks = code.blocks;
        let codeString = "";
        let indent = 0;
        for (let block of blocks) {
            let blockStringAndIndent = convertBlock(block, indent);
            let blockString = blockStringAndIndent[0];
            codeString += blockString;
            indent = blockStringAndIndent[1];
            if (blockString.endsWith("\n")) {
                codeString += "\t".repeat(indent);
            }
        }
        return codeString;
    } catch (e) {
        return `Error while decoding data: ${e}`;
    }
}

function convertBlock(block, indent) {
    switch (block.id) {
        case "block": {
            if (block.block === "else") {
                return ["ELSE\n", indent];
            }

            let kind = block.block;
            let blockData = BLOCK_MAP[kind];
            let blockName = blockData.name;
            let blockAction = block.action === "" ? "<empty>" : (block.action ?? block.data) + (block.subAction !== undefined ? `[${block.subAction}]` : "");
            blockAction = blockAction.trim();
            
            let fullString = blockName + ": ";
            if (block.inverted !== undefined) {
                fullString += block.inverted + " " ;
            }
            fullString += blockAction;
            if (block.target !== undefined) {
                fullString += `<${block.target}>`;
            }

            if (block.args != null) {
                let argsAndTags = formatArgs(block.args);
                let argString = "";
                if (argsAndTags.args.length > 0) {
                    argString += "\n" + "\t".repeat(indent + 1) + 
                    argsAndTags.args.join(",\n" + "\t".repeat(indent + 1));
                }
                if (argsAndTags.tags.length > 0) {
                    argString += ";\n" + (argsAndTags.args.length == 0 ? "" : "\n") + "\t".repeat(indent + 1) + 
                    argsAndTags.tags.join(",\n" + "\t".repeat(indent + 1));
                }
                argString = argString.replace(/\n\t+,/g, " ,");
                fullString += ` {${argsAndTags.args.length == 0 && argsAndTags.tags.length == 0 ? "" : argString + "\n" + "\t".repeat(indent)}}`;
                
            }
            if (blockData.newline) {
                fullString += "\n";
            } else {
                fullString += " ";
            }
            return [fullString, blockData.start ? indent + 1 : indent];
        }
        case "bracket": {
            if (block.direct === "open") {
                if (block.type === "repeat") {
                    return ["FOR\n", indent + 1];
                }
                return ["DO\n", indent + 1];
            } else {
                if (block.type === "repeat") {
                    return ["LOOP\n", indent - 1];
                }
                return ["END\n", indent - 1];
            }
        }
    }
}

function formatArgs(args) {
    let finalArgs = [];
    let tags = [];
    for (let itemObj of args.items) {
        let item = itemObj.item;
        let data = item.data;
        switch (item.id) {
            case "txt":
                let text = data.name;
                text = text.replace(/\\/g, "\\\\");
                text = text.replace(/"/g, "\\\"");
                finalArgs[itemObj.slot] = `Text("${text}")`;
                break;
            case "num":
                finalArgs[itemObj.slot] = `Number(${data.name})`;
                break;
            case "loc":
                finalArgs[itemObj.slot] = `Location(${data.isBlock}, ${data.loc.x}, ${data.loc.y}, ${data.loc.z}, ${data.loc.pitch}, ${data.loc.yaw})`;
                break;
            case "vec":
                finalArgs[itemObj.slot] = `Vector(${data.x}, ${data.y}, ${data.z})`;
                break;
            case "snd":
                finalArgs[itemObj.slot] = `Sound(${data.sound}, ${data.pitch}, ${data.vol}, ${data.variant ?? ""})`;
                break;
            case "part": 
                let finalString = "Particle(";
                finalString += `${data.particle}, `;
                finalString += `${data.cluster.amount}, ${data.cluster.horizontal}, ${data.cluster.vertical}, `;
                finalString += `${data.data.rgb ?? "0"}, `;
                finalString += `${data.data.size ?? "1"}, `;
                finalString += `${data.data.colorVariation ?? "0"}, `;
                finalString += `${data.data.sizeVariation ?? "0"}, `;
                finalString += `${data.data.material ?? "STONE"}, `;
                finalString += `${data.data.x ?? "0"}, `;
                finalString += `${data.data.y ?? "0"}, `;
                finalString += `${data.data.z ?? "0"}, `;
                finalString += `${data.data.motionVariation ?? "0"}, `;
                finalString += `${data.data.roll ?? "0"})`;
                finalArgs[itemObj.slot] = finalString;
                break;
            case "g_val": 
                finalArgs[itemObj.slot] = `GameValue(${data.type}, ${data.target})`;
                break;
            case "pot":
                finalArgs[itemObj.slot] = `Potion(${data.pot}, ${data.dur}, ${data.amp})`;
                break;
            case "var":
                finalArgs[itemObj.slot] = `Variable(${data.name}, ${data.scope})`;
                break;
            case "item":
                finalArgs[itemObj.slot] = `Item(${data.item})`;
                break;
            case "bl_tag":
                tags.push(`${data.tag}: ${data.option}`);
                break;
            default:
                finalArgs[itemObj.slot] = `Unknown(${item.id})`;
                break;
        }
    }            
    return {args: finalArgs, tags: tags};
}

// Convert code to raw data
function convertCode(code) {

    // Split code into blocks, iterate through each block;
    // Since regex is not good at matching nested brackets, we will split the code into blocks
    let blocks = code.trim().split(/(?<=\}|DO|END|FOR|LOOP|ELSE)\s+(?=\w)/g);

    let finalCode = {blocks: []};
    for (let block of blocks) {
        if (block == "DO" || block == "END" || block == "FOR" || block == "LOOP") {
            // These are brackets
            let bracket = {id: "bracket", type: (block == "DO" || block == "END") ? "norm" : "repeat", direct: (block == "DO" || block == "FOR") ? "open" : "close"};
            finalCode.blocks.push(bracket);
        } else if (block == "ELSE") {
            finalCode.blocks.push({id: "block", block: "else"});
        } else {
            // Parse block
            let blockObj = {id: "block", args: {items: []}, block: ""};
            let blockData = block.matchAll(/^(.+?): (?:([^ ]+?) )?([^{]*?)(?:\[(.+?)\])?(?:<(.+)>)? (.+)$/gms).next().value;
            let blockType = blockData[1] != null ? blockData[1].trim() : blockData[1];
            let blockNegate = blockData[2] != null ? blockData[2].trim() : blockData[2];
            let blockAction = blockData[3] != null ? blockData[3].trim() : blockData[3];
            let blockSubAction = blockData[4] != null ? blockData[4].trim() : blockData[4];
            let blockTarget = blockData[5] != null ? blockData[5].trim() : blockData[5];
            let blockArgs = blockData[6] != null ? blockData[6].trim() : blockData[6];
            blockObj.block = INVERSE_MAP[blockType];
            if (blockNegate !== undefined) {
                blockObj.inverted = blockNegate;
            }
            let sub = blockAction == "<empty>" ? "" : blockAction;
            if (["FUNCTION", "PROCESS", "CALL FUNCTION", "START PROCESS"].includes(blockType)) {
                blockObj.data = sub;
            } else {
                blockObj.action = sub;
            }
            if (blockSubAction !== undefined) {
                blockObj.subAction = blockSubAction;
            }
            if (blockTarget !== undefined) {
                blockObj.target = blockTarget;
            }
            blockObj.args.items = parseArgs(blockArgs, blockAction, INVERSE_MAP[blockType]);
            finalCode.blocks.push(blockObj);
        }
    }
    console.dir(finalCode);
    return btoa(pako.gzip(JSON.stringify(finalCode), {to: "string"}));
}

function parseArgs(args, blockAction, blockType) {
    // Can't use regex because it can't match nested brackets
    // Format: {Argument("Hello, ()world"), Argument(1), Argument(1, 2, 3), Argument(), Argument(); TagName: TagOption, TagName: TagOption}
    
    // CAN'T. USE. REGEX. FOR. THIS.
    let commaSeparated = args.slice(1, -1);
    let rawArguments = [];
    let rawTags = [];
    let currentArg = ["", ""];
    let inString = false;
    let stringCharacter = "\""
    let inArgument = false;
    let parsingTags = false;
    let depth = 0;
    let nextEscape = false;
    for (let i = 0; i < commaSeparated.length + 1; i++) {
        let char = commaSeparated[i];
        console.log(char, currentArg, depth);
        if (nextEscape) {
            nextEscape = false;
            if (char == null) {
                currentArg[0] += "\\";
                continue;
            }
            if (inArgument) {
                currentArg[1] += char;
            } else {
                if (char.match(/\s/)) {
                    continue;
                }
                currentArg[0] += char;
            }
        } else if (parsingTags) {
            if (char == ":") {
                currentArg[0] = currentArg[0].trim();
                inArgument = true;
                continue;
            }
            if (char == "," || char == null) {
                currentArg[1] = currentArg[1].trim();
                rawTags.push(currentArg);
                currentArg = ["", ""];
                inArgument = false;
                continue;
            }
            if (inArgument) {
                currentArg[1] += char;
            } else {
                currentArg[0] += char;
            }
        } else {
            if (char == "\\" && currentArg[0].trim() != "Item") {
                nextEscape = true;
                continue;
            }
            if (["\"", "'"].includes(char) && !inString && currentArg[0].trim() != "Item") {
                inString = true;
                stringCharacter = char;
                continue;
            }
            if (char == stringCharacter && currentArg[0].trim() != "Item") {
                inString = !inString;
                continue;
            }
            if (char == "(" && !inString) {
                if (depth == 0) {
                    inArgument = true;
                } else {
                    currentArg[1] += char;
                }
                depth += 1;
                continue;
            }
            if (char == ")" && !inString && inArgument) {
                if (depth == 1) {
                    inArgument = false;
                } else {
                    currentArg[1] += char;
                }
                depth -= 1;
                continue;
            }
            if ((char == "," && !inString && !inArgument) || char == null) {
                if (currentArg != null && currentArg[0] == "" && currentArg[1] == "") {
                    currentArg = null;
                }
                rawArguments.push(currentArg);
                currentArg = ["", ""];
                continue;
            }
            if (char == ";" && !inString && !inArgument) {
                rawArguments.push(currentArg);
                currentArg = ["", ""];
                parsingTags = true;
                continue;
            }
            if (inArgument) {
                currentArg[1] += char;
            } else {
                if (char.match(/\s/)) {
                    continue;
                }
                currentArg[0] += char;
            }
        }
    }

    // Now that we have the raw arguments, we can parse them

    let items = [];

    for (let i = 0; i < rawArguments.length; i++) {
        let arg = rawArguments[i];
        if (arg == null) {
            continue;
        }
        switch (arg[0]) {
            case "Number":
                items.push({item: {
                    id: "num",
                    data: {name: arg[1]}
                }, slot: i});
                break;
            case "Text":
                // Unescape string
                let unescaped = arg[1].replace(/\\(.)/g, "$1");
                items.push({item: {
                    id: "txt",
                    data: {name: unescaped}
                }, slot: i});
                break;
            case "Location":
                let coords = arg[1].split(",");
                let isBlock = coords[0] == "true";
                coords = coords.map(x => parseFloat(x));
                items.push({item: {
                    id: "loc",
                    data: {
                        isBlock: isBlock,
                        loc: {
                            x: coords[1],
                            y: coords[2],
                            z: coords[3],
                            pitch: coords[4],
                            yaw: coords[5]
                        }
                    }
                }, slot: i});
                break;
            case "Vector":
                let vector = arg[1].split(",");
                vector = vector.map(x => parseFloat(x));
                items.push({item: {
                    id: "vec",
                    data: {
                        x: vector[0],
                        y: vector[1],
                        z: vector[2]
                    }
                }, slot: i});
                break;
            case "Sound":
                let sound = arg[1].split(",");
                let soundName = sound[0].trim();
                let soundPitch = parseFloat(sound[1]);
                let soundVolume = parseFloat(sound[2]);
                let soundVariant = sound[3] ?? null;
                let soundObj = {
                    sound: soundName,
                    pitch: soundPitch,
                    vol: soundVolume
                };
                if (soundVariant != null) {
                    soundObj.variant = soundVariant.trim();
                }
                items.push({item: {
                    id: "snd",
                    data: soundObj
                }, slot: i});
                break;
            case "Particle":
                let particle = arg[1].split(",");
                let particleObj = {
                    particle: particle[0],
                    cluster: {
                        amount: parseFloat(particle[1]),
                        horizontal: parseFloat(particle[2]),
                        vertical: parseFloat(particle[3])
                    },
                    data: {
                        rgb: parseInt(particle[4]) ?? null,
                        size: parseFloat(particle[5]) ?? null,
                        colorVariation: parseFloat(particle[6]) ?? null,
                        sizeVariation: parseFloat(particle[7]) ?? null,
                        material: particle[8].trim() ?? null,
                        x: parseFloat(particle[9]) ?? null,
                        y: parseFloat(particle[10]) ?? null,
                        z: parseFloat(particle[11]) ?? null,
                        motionVariation: parseFloat(particle[12]) ?? null,
                        roll: parseFloat(particle[13]) ?? null
                    }
                };
                // Remove null values
                for (let key in particleObj.data) {
                    if (particleObj.data[key] == null) {
                        delete particleObj.data[key];
                    }
                }
                items.push({item: {
                    id: "part",
                    data: particleObj
                }, slot: i});
                break;
            case "Potion":
                let potion = arg[1].split(",");
                let potionObj = {
                    pot: potion[0].trim(),
                    dur: parseFloat(potion[1]),
                    amp: parseFloat(potion[2])
                };
                items.push({item: {
                    id: "pot",
                    data: potionObj
                }, slot: i});
                break;
            case "Variable":
                let variable = arg[1].split(",");
                let variableObj = {
                    name: variable[0].trim(),
                    scope: variable[1].trim()
                };
                items.push({item: {
                    id: "var",
                    data: variableObj
                }, slot: i});
                break;
            case "GameValue":
                let gameValue = arg[1].split(",");
                let gameValueObj = {
                    type: gameValue[0].trim(),
                    target: gameValue[1].trim()
                };
                items.push({item: {
                    id: "g_val",
                    data: gameValueObj
                }, slot: i});
                break;
            case "Item":
                items.push({item: {
                    id: "item",
                    data: {item: arg[1]}
                }, slot: i});
                console.log(arg[1]);
                break;
            default:
                console.error(`Unknown argument type "${arg[0]}"`);
            case "":
                break;
        }
    }

    // Now, for the tags

    for (let i = 0; i < rawTags.length; i++) {
        let tag = rawTags[i];
        if (tag == null) {
            continue;
        }
        items.push({item: {
            id: "bl_tag",
            data: {
                tag: tag[0].trim(),
                option: tag[1].trim(),
                action: ["func", "process"].includes(blockType) ? "dynamic" : blockAction,
                block: blockType
            }
        }, slot: i + (27 - rawTags.length)});
    }
    return items;
}

var ws;
const message = document.querySelector("div.message");

function connectRecode() {
    // Establish connection to recode via websocket
    try {
        ws = new WebSocket("ws://localhost:31371/codeutilities/item");
        ws.onopen = function() {
            console.log("Successfully connected to recode!");
            document.getElementById("send").disabled = false;
        }
        ws.onmessage = function(e) {
            let response = JSON.parse(e.data);
            if (response.status != "success") {
                message.classList.remove("hidden");
                message.textContent = `Recode returned an error! \n ${JSON.stringify(response)}`;

            }
        }
    } catch (e) {
        message.classList.remove("hidden");
        message.textContent = `Failed to connect to recode! \n ${e}`;
        return;
    }
}

function sendToRecode() {
    try {
        let data = {
            type: "template",
            data: JSON.stringify({ // Why does this need to be stringified? I don't know! But the API requires it! :P
                name: "§eImported Template",
                author: "SDF",
                version: 1,
                data: textArea.value
            }),
            source: "SDF"
        };
        ws.send(JSON.stringify(data));
    } catch (e) {
        message.classList.remove("hidden");
        message.textContent = `Failed to send to recode! \n ${e}`;
        return;
    }
}

function closeMessage() {
    message.classList.add("hidden");
}