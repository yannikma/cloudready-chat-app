# CloudComputing SoSe22 Gruppe 1

## Getting started
To start the project simply run the following command in the root directory of the project:
```
docker-compose up
```

## Project Description
### Functionalities
This is a project that focuses on the use of modern web and cloud technologies, the focus is not the functionality of the chat app itself.
However, the chat app has basic features like:
* Login/Registration
* Sending messages to
  *    all users
  *    a selected group of users
  *    one user
* Sending files
* See online users

### Technologies
* NodeJS: The technology for the Webserver Development
  * Express: For Rest Requests
  * Socket.io: For Live-chat functionalities
  * bcrypt: storing passwords safely
* MongoDB: Storing user data
* Prometheus: Define metrics for the app
* Grafana: Display the metrics that are measured
* Nginx: This is the apps' loadbalancer, which acts as a reverse proxy. It decides via Round Robin, which instance of our server handles a request. Moreover, it implements TLS so the network traffic is secured.
* Redis: Allow Communication between our Server instances
* Docker: In our docker compose file we have all the needed Containers defined, so they can run everywhere in the same network with just one command.



