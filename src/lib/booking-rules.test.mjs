import {test} from 'node:test';import assert from 'node:assert/strict';import{withinBookingWindow,validWeeklyHours,GROUP_DURATION_MINUTES,DEFAULT_GROUP_CAPACITY}from './booking-rules.ts';
test('booking window ends exactly 72 hours from now',()=>{const now=Date.parse('2026-11-27T23:00:00Z');assert.equal(withinBookingWindow(now+72*3600000,now,0),true);assert.equal(withinBookingWindow(now+72*3600000+1,now,0),false);assert.equal(withinBookingWindow(now-1,now,0),false);});
test('groups have 10 applicants every 30 minutes',()=>{assert.equal(DEFAULT_GROUP_CAPACITY,10);assert.equal(GROUP_DURATION_MINUTES,30);});
test('Saturday allowed, Sunday OFF',()=>{assert.equal(validWeeklyHours({'6':[['08:00','11:00']],'0':[]}),true);assert.equal(validWeeklyHours({'0':[['09:00','10:00']]}),false);});
test('invalid hours and reversed ranges rejected',()=>{assert.equal(validWeeklyHours({'1':[['17:00','09:00']]}),false);assert.equal(validWeeklyHours({'1':[['25:00','26:00']]}),false);});
