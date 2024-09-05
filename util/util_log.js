function addDebugLog(message) {
    
        console.log(message);
    
}

/**
 * Logs a function call if debug info is activated.
 * @param {string} functionName - The name of the function being called.
 */
function addCallLog(functionName) {
    
        console.log("*** " + functionName + " ***");
    
}

module.exports = {
    addDebugLog,
    addCallLog
};