import { expect, it } from "vitest"
import {
  SCHEMA_VERSION as sqliteVersion,
  fanOutSchemaChecksum as sqliteFanOutChecksum,
  schemaChecksum as sqliteChecksum,
  treeSchemaChecksum as sqliteTreeChecksum,
} from "../src/sql/schema.js"
import {
  SCHEMA_VERSION as postgresVersion,
  fanOutSchemaChecksum as postgresFanOutChecksum,
  schemaChecksum as postgresChecksum,
  treeSchemaChecksum as postgresTreeChecksum,
} from "../src/sql/postgres/schema.js"
import {
  SCHEMA_VERSION as mysqlVersion,
  fanOutSchemaChecksum as mysqlFanOutChecksum,
  schemaChecksum as mysqlChecksum,
  treeSchemaChecksum as mysqlTreeChecksum,
} from "../src/sql/mysql/schema.js"

it("freezes schema version 6 checksums for every dialect", () => {
  expect({ sqliteVersion, postgresVersion, mysqlVersion }).toEqual({
    sqliteVersion: 6,
    postgresVersion: 6,
    mysqlVersion: 6,
  })
  expect(sqliteFanOutChecksum()).toBe("831a6ebe391c77089ebc5419a1065ba68cef8e08832ea11a59c7e4c799cd44ef")
  expect(postgresFanOutChecksum()).toBe("d2ff9436b7b84182342ec83848a625162c02e4660d8728f8b778933965d05143")
  expect(mysqlFanOutChecksum()).toBe("3fa3302e14f955cc91aeefb76a8211db20a15bbb95894dfd30b7670196b7f9f3")
  expect(sqliteTreeChecksum()).toBe("d4b3045a8f806b87704ca42edd68fd9310fab1f5f8804ed9908c178cee86fb09")
  expect(postgresTreeChecksum()).toBe("0011b6d6e8159e9948076e44904ed770c31bed135dd19bfa499baf7cab82731a")
  expect(mysqlTreeChecksum()).toBe("35e4f748bfc1f41d37290ef5be6f517ddef716be99759603d8482c509adb9b2a")
  expect(sqliteChecksum()).toBe("04a205700b2792b219b9fda7a048b45a9d56e235bc4cf43d2f32130795d2c1ad")
  expect(postgresChecksum()).toBe("120badba768430daa2433075f05351a46e2287d7ffdd9d5991381245b6c380cd")
  expect(mysqlChecksum()).toBe("f31660b2abb5e1ac4d4f86dbb94861f13921b8305dcc967b3b2854e7d97fa3e2")
})
