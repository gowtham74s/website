import { test } from "node:test";
import assert from "node:assert/strict";
import { localDateKey, offsetMinutes, parseSamsungCsv, parseSamsungExport, parseUtc, splitCsvLine } from "../samsung.ts";

test("csv splitting with quotes", () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d,'), ["a", "b,c", "d", ""]);
  assert.deepEqual(splitCsvLine('"say ""hi""",2'), ['say "hi"', "2"]);
});

test("header prefixes are stripped and metadata line skipped", () => {
  const rows = parseSamsungCsv("com.samsung.shealth.exercise,6316006,3\ncom.samsung.health.exercise.start_time,com.samsung.health.exercise.distance,time_offset,\n2026-03-01 01:00:00.000,3200,UTC+0530,\n");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].start_time, "2026-03-01 01:00:00.000");
  assert.equal(rows[0].distance, "3200");
});

test("time offsets and local dates", () => {
  assert.equal(offsetMinutes("UTC+0530"), 330);
  assert.equal(offsetMinutes("UTC-0700"), -420);
  // 20:00 UTC on 1 Mar is 01:30 on 2 Mar in India
  assert.equal(localDateKey(parseUtc("2026-03-01 20:00:00.000")!, 330), "2026-03-02");
});

test("full export: steps prefer merged source, exercises typed, sleep merged, weight per day", () => {
  const day = Date.UTC(2026, 2, 2); // midnight of the local day, epoch ms
  const files = [
    { name: "jsons/com.samsung.shealth.step_daily_trend.20260310.csv", text: `com.samsung.shealth.step_daily_trend,1,1\nday_time,count,distance,calorie,source_type,\n${day},6000,4500,200,0,\n${day},9000,6800,310,-2,\n` },
    { name: "com.samsung.shealth.exercise.20260310.csv", text: "com.samsung.shealth.exercise,1,1\ncom.samsung.health.exercise.start_time,com.samsung.health.exercise.end_time,com.samsung.health.exercise.exercise_type,com.samsung.health.exercise.duration,com.samsung.health.exercise.distance,com.samsung.health.exercise.calorie,com.samsung.health.exercise.time_offset\n2026-03-02 12:00:00.000,2026-03-02 12:45:00.000,1002,2700000,6100,420,UTC+0530\n" },
    { name: "com.samsung.shealth.sleep.20260310.csv", text: "com.samsung.shealth.sleep,1,1\ncom.samsung.health.sleep.start_time,com.samsung.health.sleep.end_time,com.samsung.health.sleep.time_offset\n2026-03-01 17:30:00.000,2026-03-01 21:00:00.000,UTC+0530\n2026-03-01 21:15:00.000,2026-03-02 01:00:00.000,UTC+0530\n" },
    { name: "com.samsung.health.weight.20260310.csv", text: "com.samsung.health.weight,1,1\nstart_time,weight,body_fat,time_offset\n2026-03-02 02:00:00.000,78.4,18.5,UTC+0530\n2026-03-02 14:00:00.000,78.9,0,UTC+0530\n" },
    { name: "com.samsung.shealth.heart_rate.20260310.csv", text: "ignored" },
  ];
  const d = parseSamsungExport(files);
  assert.equal(d.files.length, 4);
  assert.deepEqual(d.steps, [{ date: "2026-03-02", steps: 9000, distance_km: 6.8, calories: 310 }]);
  assert.equal(d.exercises[0].type, "run");
  assert.equal(d.exercises[0].duration_min, 45);
  assert.equal(d.exercises[0].distance_km, 6.1);
  assert.equal(d.sleep.length, 1);
  assert.equal(d.sleep[0].date, "2026-03-02");
  assert.equal(d.sleep[0].duration_min, 435);
  assert.equal(d.weight.length, 1);
  assert.equal(d.weight[0].weight_kg, 78.9);
});
