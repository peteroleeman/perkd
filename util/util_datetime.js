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
}


module.exports = UtilDateTime;