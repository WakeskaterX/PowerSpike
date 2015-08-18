# PowerSpike - League of Legends Champion Kill Times

PowerSpike shows data on the aggregate times champions got kills throughout a match.
By looking at this data across many champions we can see when champions hit their
power spikes.

#### Prerequisites:

* Install NodeJS
* Install MongoDB (Required to store the data and retrieve it)
* Install NPM
* Download the application and run: npm install

To run the application:

**Start the Parser to begin data collection:**

    node riot_parser.js   //will run the parser.

**Start the Web Server:**

    node server.js  //will start the web server.


You can then access the page at localhost:3000/index.html and start searching!

### Visit the hosted version!
You can view hosted version at:

http://www.powerspike.xyz/
