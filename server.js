const API_VERSION = "1.9";

const {
  getStore,
  writeTransaction
} = require("./storeController");


// call the packages we need
var express    = require('express');        // call express
var app        = express();                 // define our app using express
var bodyParser = require('body-parser');
var OdooRouter = require('./odoorouter');
var DemoOdooRouter = require("./demoodoorouter");


var {Logging} = require('@google-cloud/logging');
const GKashRouter = require("./gkashrouter");
var projectId = 'foodio-ab3b2'; // Your Google Cloud Platform project ID
var logName = 'perkd-log'; // The name of the log to write to
var logging = new Logging({projectId});
var log = logging.log(logName);

const metadata = {
        resource: {type: 'global'},
        // See: https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#logseverity
        severity: 'INFO',
      };


function writeLog(logValue)
{
    const entry = log.entry(metadata, logValue);
    log.write(logValue);
}
// configure app to use bodyParser()
// this will let us get the data from a POST
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});


var port = process.env.PORT || 8080;        // set our port
var storeId = "S_172a0745-2d5e-4f7a-9b98-ee4ad6fe0067" ; //set the test store id


// ROUTES FOR OUR API
// =============================================================================
var router = express.Router();              // get an instance of the express Router

// test route to make sure everything is working (accessed at GET http://localhost:8080/api)
router.get('/', function(req, res) {
    res.json({ message: 'foodio api version ' + API_VERSION });
});

// more routes for our API will happen here
//POST
router.route('/pay/:machine_id')

    // create a bear (accessed at POST http://localhost:8080/perkd/bears)
    .post(function(req, res) {
         let machineId = req.params.machine_id ?? "";
         console.log("POST pay " + machineId);
         //writeLog({ message: 'POST pay ' + machineId, payload: req});
         res.json({ message: 'POST pay ' + machineId});
         //writeTransaction("post123456", "post machine id " + machineId ,res);


    })
    .get(function(req, res) {
        let machineId = req.params.machine_id ?? "";
        console.log("GET pay " + machineId);
        res.json({ message: 'GET pay ' + machineId});

          }

     );

router.route('/checkin/:machine_id')

        // create a bear (accessed at POST http://localhost:8080/perkd/bears)
        .post(function(req, res) {

              console.log("POST checkin " + machineId);
             res.json({ message: 'POST checkin ' + machineId });


        })
        .get(function(req, res) {
              let machineId = req.params.machine_id ?? "";
              console.log("GET checkin " + machineId);
              res.json({ message: 'GET checkin ' + machineId });

                });

router.route('/order/:machine_id')

    // create a bear (accessed at POST http://localhost:8080/perkd/bears)
    .post(function(req, res) {
         let machineId = req.params.machine_id ?? "";
         let refId =  req.body['referenceId'] ?? "";
         let transStatus = req.body['status'] ?? "";

         console.log("POST order " + machineId);
         console.log("status:" + transStatus );
         console.log("referenceId", refId);

         let ts = Date.now();

         let date_ob = new Date(ts);
         let date = date_ob.getDate();
         let month = date_ob.getMonth() + 1;
         let year = date_ob.getFullYear();

         // prints date & time in YYYY-MM-DD format
         let currentDate = (year + "" + month + "" + date);

         writeTransaction(machineId,currentDate, refId, transStatus, res);

    })
    .get(function(req, res) {
        let machineId = req.params.machine_id ?? "";
        console.log("GET order " + machineId);
        res.json({ message: 'GET order ' + machineId });

                    });

router.route('/pickup/:machine_id')

    // create a bear (accessed at POST http://localhost:8080/perkd/bears)
    .post(function(req, res) {
        let machineId = req.params.machine_id ?? "";

         console.log("POST pickup " + machineId);
         res.json({ message: 'POST pickup ' + machineId });

    })
    .get(function(req, res) {
           let machineId = req.params.machine_id ?? "";
           console.log("GET pickup " + machineId);
                             res.json({ message: 'GET pickup ' + machineId });

                        });




// REGISTER OUR ROUTES -------------------------------

app.use('/perkd', router);

//for odoo
const myOdoo = new OdooRouter();
app.use('/odoo', myOdoo.getRouter());

const myOdooDemo = new DemoOdooRouter();
app.use('/odoodemo', myOdooDemo.getRouter());

//for gkash
const myGKash = new GKashRouter();
app.use('/gkash', myGKash.getRouter());

// START THE SERVER
// =============================================================================
app.listen(port);
console.log('Magic happens on port ' + port);