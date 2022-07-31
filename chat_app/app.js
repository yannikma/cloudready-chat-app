// Importing express module
const express = require('express');
const app = express();
// Importing fs module
const fs = require('fs');
// Importing the Prometheus-Client
const promClient = require('prom-client')

// TLS credentials
const credentials = {
    key: fs.readFileSync('certs/key.pem', 'utf-8'),
    cert: fs.readFileSync('certs/cert.pem', 'utf-8'),
}

const {createAdapter} = require('@socket.io/redis-adapter');
const {createClient} = require('redis');

// Create the redis publisher + subscriber client
const pubClient = createClient({
    url: 'redis://redis:6379'
});
const subClient = pubClient.duplicate();

//const server = require('https').createServer(credentials, app);
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
   /* path: '/socket.io',
    allowEIO3: true // false by default*/
});

// connect to redis clients
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
    io.adapter(createAdapter(pubClient, subClient));
});

pubClient.on('error', err => {
    console.log(err);
});

pubClient.on('connect', () => {
    console.log('Redis client connected');
});


// Creating the setup to measure application metrics
// ----------------------------------------------------------
const register = new promClient.Registry()

// Add a default label which is added to all metrics
register.setDefaultLabels({
    app: 'chat-app'
})

// Enable the collection of default metrics
promClient.collectDefaultMetrics({register})

const broadcastCounter = new promClient.Counter(
    {
        name: 'sent_broadcasts_total',
        help: 'The total number of sent broadcasts',
    },
);
const multicastCounter = new promClient.Counter(
    {
        name: 'sent_multicast_total',
        help: 'The total number of sent multicast',
    },
);
const unicastCounter = new promClient.Counter(
    {
        name: 'sent_unicast_total',
        help: 'The total number of sent unicast',
    },
);
const histogram = new promClient.Histogram(
    {
        name: 'node_request_duration_seconds',
        help: 'Histogram ro show the duration in seconds',
        buckets: [1, 2, 5, 6, 10]
    }
)

register.registerMetric(broadcastCounter);
register.registerMetric(multicastCounter);
register.registerMetric(unicastCounter);
// ----------------------------------------------------------

// Creating the mongo client
const MongoClient = require('mongodb').MongoClient;
// Creating the connection url for mongodb with the required credentials from the environment.
const url = `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@mongodb:27017/?authMechanism=DEFAULT`;

const bcrypt = require('bcrypt');
const {hash} = require("bcrypt");

const connectedSockets = new Map();
let connectedUsers = new Map();


app.use(express.json());

const port = process.env.APPLICATION_PORT

// The following statements define the routes of the website.
// ----------------------------------------------------------
app.get('/', (req, res) => {
    console.log(`PAGE LOADED FROM ${process.env.SERVER_INSTANCE}`);
    res.sendFile(__dirname + '/pages/register.html');
});
app.get('/login.html', (req, res) => {
    res.sendFile(__dirname + '/pages/login.html');
});
app.get('/register.html', (req, res) => {
    res.sendFile(__dirname + '/pages/register.html');
});
// TODO:
app.get('/chat-:name', (req, res) => {
    console.log('Name: ' + req.params.name)
    res.sendFile(__dirname + '/pages/chat.html');
});

// ----------------------------------------------------------

/**
 * establishing the socket.io connection.
 */
io.on('connection', (socket) => {

    socket.on("connect_error", (err) => {
        console.log(`connect_error due to ${err.message}`);
    });

    /**
     * Here we catch if a user is online and add the user-data to the "allConnectedSockets"-List, but just if the user doesn't already exist
     * Plus we update our list of all users (online + offline)
     */
    socket.on('user-connect', async username => {

        connectedSockets.set(socket.id, username);

        if (connectedUsers.get(username)) {
            connectedUsers.get(username).push(socket.id);
            console.log(username + ' logged in on new device')
        } else {
            connectedUsers.set(username, new Array(socket.id));
            console.log(username + ' logged in')

            io.emit('online-users', Array.from(connectedUsers.keys()));
            const data = {username: username, time: Date.now()}
            socket.broadcast.emit('user-connect', data);
            //
            socket.name = username;
            //await redisClient.setAsync(`socketIdFor-${username}`, socket.id);
        }
    })

    /**
     * If a user disconnects, it will search in the "allConnectedSockets"-List for the socket-ID and remove the complete user from the list.
     * After we update the list, we will send the results via emit.
     */
    socket.on('disconnect', async () => {

        const name = connectedSockets.get(socket.id)
        const arrayToEdit = connectedUsers.get(name)

        if (arrayToEdit !== undefined) {
            if (arrayToEdit.length === 1) {
                connectedUsers.delete(name)
                console.log(name + ' disconnected');

                const data = {username: name, time: Date.now()}
                socket.broadcast.emit('user-disconnect', data);

            } else {
                const indexOfId = arrayToEdit.indexOf(socket.id)
                arrayToEdit.splice(indexOfId, 1)
                console.log(name + ' disconnected on one device');
            }
        }
        connectedSockets.delete(socket.id)

        console.log('Online Users: ' + connectedUsers)
        // socket.broadcast.emit('online-users', Array.from(connectedUsers.keys()));
        io.emit('online-users', Array.from(connectedUsers.keys()));
        //await redisClient.delAsync(`socketIdFor-${socket.name}`);
    });

    /**
     * This method is responsible to send a messages to all chat members.
     * @param msg - the message which will be sent
     */
    socket.on('broadcast', msg => {
        const data = {message: msg.message, name: connectedSockets.get(socket.id), time: msg.time};
        socket.broadcast.emit('chat-message', data);  // This will emit the event (only) to all other connected sockets
        console.log("new message received: ");
        console.log(data);
        broadcastCounter.inc();
    });

    /**
     * This method is responsible to send a messages to selected chat members, who are online at the moment.
     * @param msg - the message which will be sent
     */
    socket.on('multicast', msg => {
        const data = {message: msg.message, name: connectedSockets.get(socket.id), time: msg.time};
        console.log("new message received: ");
        console.log(data);
        msg.receivers.forEach((receiver) => {
                console.log('Receiver:' + receiver)
                connectedUsers.get(receiver).forEach(socketId => {
                    socket.broadcast.to(socketId).emit('chat-message', data);
                })
            }
        )
        multicastCounter.inc();
    });

    /**
     * This method is responsible to send a messages to one specific chat member, who is online at the moment.
     * @param msg - the message which will be sent
     */
    socket.on('unicast', msg => {
        const data = {message: msg.message, name: connectedSockets.get(socket.id), time: msg.time};
        console.log("new message received: ");
        console.log(data);

        connectedUsers.get(msg.receiver).forEach(socketId => {
            socket.broadcast.to(socketId).emit('chat-message', data);
        })
        unicastCounter.inc();
    });

    /**
     * This method is responsible to send a file to the chat.
     * @param file - the file which will be sent
     */
    socket.on('multimedia', (file) => {
        console.log(`received new multimedia message: ${file.fileName}`);

        io.emit('multimedia', {
            file: file.file,
            fileName: file.fileName,
        });

    });


});


/**
 * When users are creating an account via the Website, they send their post request, which gets handled in the following function.
 * The handler stores the userdata in our local mongoDB in the users-collection.
 */
app.post('/handle_signup', (req, res) => {
    console.log("Register new account with the following username: ");
    console.log(req.body.username);

    // Connect to our local mongoDB
    MongoClient.connect(url, function (err, db) {
        const dbo = db.db("userdb");
        if (err) {
            res.sendStatus(404);
            throw err;
        }

        // Checking, if the username is already in use
        dbo.collection("users").findOne({username: req.body.username}, function (err, result) {
            if (result) {
                res.sendStatus(409);
            } else {
                // Salting and hashing the password with bcrypt
                bcrypt.genSalt(10, function (err, salt) {
                    bcrypt.hash(req.body.password, salt, function (err, hash) {
                        console.log("The hashed password is: ")
                        console.log(hash);
                        // Storing the username and the password-hash in the mongoDB.
                        dbo.collection("users").insertOne({
                            username: req.body.username,
                            password: hash
                        }, function (err, res) {
                            if (err) throw err;
                            console.log("added the user to the database");
                            db.close();
                        });
                    });
                });
                app.get('/chat-' + req.body.username, (req, res) => {
                    res.sendFile(__dirname + '/pages/chat.html');
                });
                res.sendStatus(200);
            }
        });


    });
});


/**
 * When users are signing in to an existing account, they send a post-request with their credentials, which gets handled by this function.
 * The handler checks if the credentials exist in the local mongoDB. If the credentials are correct the status code 200 will be sent as a response, if they don't the status code 404 will be sent back.
 */
app.post('/handle_signin', (req, res) => {
    console.log("The following user tries to log in: ");
    console.log(req.body.username);

    // Connect to our local mongoDB
    MongoClient.connect(url, function (err, db) {
        if (err) throw err;
        const dbo = db.db("userdb");

        // Checking if the entered username exists in our mongoDB.
        dbo.collection("users").findOne({username: req.body.username}, function (err, result) {
            if (err) throw err;

            // sending back an error-code when the username does not exist in the mongoDB.
            if (result == null) {
                console.log("No User with that username");
                res.sendStatus(404);
            } else {

                // Checking if the entered password is correct. This is possible with the bycrypt-comparison-functionality.
                // When the password is correct we respond with a positive response-code, if not we sent back an error response-code.
                bcrypt.compare(req.body.password, result.password, function (err, result) {
                    if (result) {
                        console.log("The password is correct");

                        // TODO: Make this more secure so not everybody can access the chat-page by entering the given link.
                        app.get('/chat-' + req.body.username, (req, res) => {
                            res.sendFile(__dirname + '/pages/chat.html');
                        });
                        res.sendStatus(200);
                    } else {
                        console.log("The password is not correct");
                        res.sendStatus(404);
                    }
                });
            }
            db.close();
        });
    });
});


// Creating the metrics endpoint
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType)
        let metrics = await register.metrics();
        res.send(metrics)
    } catch (ex) {
        res.status(500).end(ex);
    }
})


// Starting the server at the port, which is defined in the backend-environment file.
server.listen(port, () => {
    console.log(`server running at https://localhost:${port}/`);
});