function adjustFloat(doubleValue) {
    return parseFloat(parseFloat(String(doubleValue)).toFixed(2));
}

// Export the function
module.exports = {
    adjustFloat
};