# gitstatic

**Make Static Sites with GitHub Webhooks**

The gitstatic project provides a server that listens for events from GitHub repositories.  Whenever new commits are pushed to the default branch of your repository, the service will fetch the latest, run `make`, and update a static site with content from the generated archive.

The respositories for your static sites need to have a `Makefile` whose default target produces a gzipped archive of all static content.  This archive must be named like the repository itself.  So, assuming your repository is named `my-repo`, running `make` must produce a `my-repo.tgz` in the root of your repository.


## Setup

The gitstatic service requires the following to run:

 * [`bash`](http://www.gnu.org/software/bash/) (Tested on x86_64-apple-darwin13 and linux)
 * [`git`](http://git-scm.com/) (Tested with `1.8`, may work with others)
 * [`node`][node] (Tests require `>=0.10` but service should run on `0.8.x`)


### Installation

Download an archive of the latest release from the [downloads page][releases].  If you want to keep up to date with the latest, you can also clone the [repository][repository] and `git pull origin master` to get updates.


### Configuration

The `receiver.js` script is configured with a number of environment variables.

| Variable               | Description |
|------------------------|-------------|
| `RECEIVER_REPO_OWNER`  | **(Required)** GitHub user or organization name.  The receiver will only listen for push events from repos owned by this user. |
| `RECEIVER_PORT`        | The receiver listens for [`push` events][push] on this port.  Default is `8000`.  This will determine the URL for your webhook. |
| `RECEIVER_STATIC_ROOT` | Path to a directory where all static site content will be copied.  By default, sites are generated in a `sites` directory relative to the `receiver.js` script.  For example, a repository named `foo` would result in static site content at `$RECEIVER_STATIC_ROOT/foo`.  The static root directory will be created if it doesn't exist. |
| `RECEIVER_CLONES_ROOT` | Repositories will be cloned into this directory.  By default, repositories are cloned in a `repos` directory relative to the `receiver.js` script. The clones root directory will be created if it doesn't exist. |
| `RECEIVER_LOG_LEVEL`   | Logging level.  Default is `info`.  Also accepts `silent` (nothing, not even errors), `error` (only errors), `info`, `verbose`, and `debug`.  From left to right, these result in more detailed output. |
| `RECEIVER_USE_SSH`     | Whether to use the `ssh_url` for cloning the repository. Default is `true`. |

### Running

The `receiver.js` service can be started with [`node`][node].  The service is configured with a number of environment variables.  The `RECEIVER_REPO_OWNER` variable is required, and without it the server will not start.  The `RECEIVER_REPO_OWNER` value is the name of a GitHub user or organization.  The server only pays attention to GitHub [`push` events][push] from this user/organization.  Additional configuration is discussed above, but a minimal setup to run the server would look like this:

```bash
# replace <github-user> with your user or organization name
export RECEIVER_REPO_OWNER=<github-user>
node receiver.js
```

### Adding webhooks

With your `receiver.js` server running, you're now ready to add a GitHub webhook so that [`push` events][push] trigger builds of your site.  On the settings page for your repository, follow links to add a new webhook.  The payload URL for the webhook is the URL for your receiver service (e.g. http://example.com:8000/).  The content type is `application/json`, and you only need to have [`push` events][push] sent (others will be ignored).

When a `push` event is received, if it comes from the default branch of one of your repositories (based on the value of `RECEIVER_REPO_OWNER`), the relevant commits will be fetched, and the `builder.sh` script will run `make` to generate a gzipped archive of your site.  The content of this archived is synchronized with your site content (which will be in a directory under `RECEIVER_STATIC_ROOT`).


### tl;dr (but you did have to scroll)

The [`receiver.js`](https://github.com/tschaub/gitstatic/blob/master/receiver.js) and [`builder.sh`](https://github.com/tschaub/gitstatic/blob/master/builder.sh) scripts are all that are needed to run the service.  A very bare bones installation would involve just copying these two files into an empty directory and starting the server.

```bash
RECEIVER_REPO_OWNER=<github-user> node receiver.js
```

(Replace `<github-user>` above with your GitHub user or organization name.)


## Development

If you want to make a contribution, run the tests, or otherwise hack on this, fork and clone the [repository][repository].

From your clone, install test dependencies.

```bash
npm install
```

The tests are run on Travis, you can run them locally as well.

```bash
npm test
```

[![Current Status](https://secure.travis-ci.org/tschaub/gitstatic.png?branch=master)](https://travis-ci.org/tschaub/gitstatic)


[node]: http://nodejs.org/
[push]: https://developer.github.com/v3/activity/events/types/#pushevent
[releases]: https://github.com/tschaub/gitstatic/releases
[repository]: https://github.com/tschaub/gitstatic
