# PowerSpike - League of Legends Champion Kill Times

PowerSpike shows data on the aggregate times champions got kills throughout a match.
By looking at this data across many champions we can see when champions hit their
power spikes.

To run the application:

**Start the Parser to begin data collection:**

    node riot_parser.js   //will run the parser.

**Start the Web Server:**

    node server.js  //will start the web server.


You can then access the page at localhost:3000/index.html and start searching!

You will need to have a local instance of mongodb running to both save the data and retrieve it.


### Visit the hosted version!
You can view hosted version at:

http://www.powerspike.xyz/
