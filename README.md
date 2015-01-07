# mongodb-trigger

[![build status](https://secure.travis-ci.org/imlucas/mongodb-trigger.png)](http://travis-ci.org/imlucas/mongodb-trigger)

> Work in progress

## Example

> @todo

## Install

```
npm install --save mongodb-trigger
```

## Test

```
npm test
```

## License

MIT

## Todo

- [ ] determine if full resync really needed
- [ ] keep track of sync times/versions in `local.triggers`
- [ ] make a command/control tailable cursor so if the root collection
  (eg runs) is resyncing, children that are listening (e.g. mtp)
  will pause and do a full resync when the root is finished.
- [ ] support version so when I change my resync handler,
  mongodb-trigger will see the version change and automatically
  resync.
