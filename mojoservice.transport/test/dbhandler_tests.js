/*global console, include, UnitTest, MojoLoader */
include("mojoloader.js");
var libraries = MojoLoader.require({ name: "mojoservice.transport", version: "1.0" });
var DbHandler = libraries["mojoservice.transport"].DbHandler;
var saved_ids;

function DbHandlerTests() {
	this.kind = "DbHandlerTests:1";
	this.owner = "com.palm.mojoservices.transport";
	this.indexes = [
		{"name":"name", props:[{"name": "name"}]},
		{"name":"profession", props:[{"name": "profession"}]}
	];
	this.db = new DbHandler();
}
DbHandlerTests.prototype={
	testPutKind: function(report) {
		this.db.putKind(this.kind, this.owner, this.indexes).then(function(future) {
			if(future.result===true) {
				report(UnitTest.passed);
			} else {
				report("putKind didn't return true");
			}
		});
	},
	testPut: function(report) {
		var records = [
		{_kind: this.kind, name: "Mark", profession: "Engineer"},
		{_kind: this.kind, name: "Bozo", profession: "Clown"},
		{_kind: this.kind, name: "Bono", profession: "Musician"},
		{_kind: this.kind, name: "Yvette", profession: "Trainer"},
		{_kind: this.kind, name: "John", profession: "Engineer"}
		];
		this.db.put(records).then(function(future) {
			var results = future.result;
			if (results.length === 5) {
				saved_ids = [results[0].id, results[4].id];
				report(UnitTest.passed);
			} else {
				report("count was "+results.length+", expected 5");
			}
		});
	},
	testGet: function(report) {
		this.db.get(saved_ids).then(function(future) {
			var results = future.result;
			if (results.length === 2) {
				if (results[0].name === 'Mark' || results[0].name==='John') {
					report(UnitTest.passed);
				} else {
					report("incorrect records: "+UnitTest.toJSON(results[0])+", "+UnitTest.toJSON(results[1]));
				}
			} else {
				report("incorrect count "+results.length);
			}
		});
	},
	testFind: function(report) {
		var query = {
		   from: this.kind, 
		  where: [{ prop: "profession", op: "=", val: "Engineer" }]
		};
		this.db.find(query).then(function(future) {
			var results = future.result;
			if (results.length === 2) {
				if (results[0].name === 'Mark' || results[0].name==='John') {
					report(UnitTest.passed);
				} else {
					report("incorrect records: "+UnitTest.toJSON(results[0])+", "+UnitTest.toJSON(results[1]));
				}
			} else {
				report("incorrect count "+results.length);
			}
		});
	},
	testDel: function(report) {
		this.db.del(saved_ids).then(function(future) {
			var count = future.result;
			if (count != 2) {
				report("Count should be 2, was:"+count);
			} else {
				report(UnitTest.passed);
			}
		});
	},
	testDelQuery: function(report) {
		var query = {
		   from: this.kind, 
		  where: [{ prop: "profession", op: "=", val: "Clown" }]
		};
		this.db.del(query).then(function(future) {
			var count = future.result;
			if (count != 1) {
				report("Count should be 1, was:"+count);
			} else {
				report(UnitTest.passed);
			}
		});
	},
	testReserveIds: function(report) {
		this.db.reserveIds(10).then(function(future) {
			var count = future.result.length;
			if (count != 10) {
				report("Count should be 10, was:"+count);
			} else {
				report(UnitTest.passed);
			}
		});
	},
	testDelKind: function(report) {
		this.db.delKind(this.kind).then(function(future) {
			var result = future.result;
			if (result === true) {
				report(UnitTest.passed);
			} else {
				report("returned: "+result);
			}
		});
	}
};