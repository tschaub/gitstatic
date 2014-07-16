# gitstatic

Make static sites with GitHub webhooks.

## Setup

Setting up the gitstatic service requires the following:

 * [`bash`](http://www.gnu.org/software/bash/)
 * [`git`](http://git-scm.com/) (Tested with `1.8`, may work with others)
 * [`node`](http://nodejs.org/) (Tests require `>=0.9` but service should run on `0.8.x`)

The [`receiver.js`](https://github.com/tschaub/gitstatic/blob/master/receiver.js) and [`builder.sh`](https://github.com/tschaub/gitstatic/blob/master/builder.sh) scripts are all that are required.  If you want to install test dependencies as well, you can get everything with `npm install gitstatic`.

[![Current Status](https://secure.travis-ci.org/tschaub/gitstatic.png?branch=master)](https://travis-ci.org/tschaub/gitstatic)
