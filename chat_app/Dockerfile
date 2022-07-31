FROM node

# Creating a working directory for the Docker container
WORKDIR ./

# Copying the package files into the working directory.
COPY package*.json ./

# Downloading the needed packages.
RUN npm install

# Copying source code and other files into the working directory.
COPY . .
EXPOSE 3000

# Running the app
CMD [ "node", "app.js" ]