# PowerSpike - League of Legends Champion Kill Times

PowerSpike shows data on the aggregate times champions got kills throughout a match.
By looking at this data across many champions we can see when champions hit their powerspikes relative
to other champions in LoL and relative to patch sets and items.

Here we can see ranked and normal statistics for before and after the item update to see if that changed the overall game
of when champions were getting certain kills.

For this test we're just looking at kill data before and after, ignoring whether or not they bought the changed items.

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

Some Cool champs to see differences on from item changes:

* Ahri

* Kayle (low data but went from early spike to mid game kills)

* Xerath

**Note**:
You can toggle the data sets by clicking the colored boxes in the legend.  If it's too cluttered turn some off to get a better comparison!