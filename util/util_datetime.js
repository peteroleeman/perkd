class UtilDateTime
{
    getCurrentDateString()
    {
        let ts = Date.now();

         let date_ob = new Date(ts);
         let date = date_ob.getDate();
         let month = date_ob.getMonth() + 1;
         let year = date_ob.getFullYear();

         // prints date & time in YYYY-MM-DD format
         let currentDate = (year + "" + month + "" + date);
         return currentDate;
    }

    getGKashDateString()
    {
        let ts = Date.now();

         let date_ob = new Date(ts);
         let date = date_ob.getDate();
         let month = date_ob.getMonth() + 1;
         let year = date_ob.getFullYear();

        const formattedMonth = month.toString().padStart(2, '0');
        const formattedDate = date.toString().padStart(2, '0');
        return `${year}${month}${date}`;
    }

    getDateTimeString(format) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        switch (format) {
            case "yyyyMd":
                return `${year}${month}${day}`;
            case "yyyy-MM-dd HH:mm:ss":
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            case "yyyyMMddHHmmss":
                return `${year}${month}${day}${hours}${minutes}${seconds}`;
            // Add more cases as needed
            default:
                return "Invalid format";
        }
    }

}


module.exports = UtilDateTime;