// Synthetic software-writing experiments. Pair metadata stays hidden during play.
const pairs=[
['concrete','build','The build failed because a dependency was missing.','A missing dependency caused the build to fail.','A missing dependency stopped the build.'],
['concrete','cache','The cache retained an expired value until it was cleared.','The cache kept serving an expired value until someone cleared it.','An expired value persisted in the cache until it was cleared.'],
['detail-timing','migration','The migration added an index before the query ran.','The migration added an index before the query ran.','Before the query ran, the migration added an index.'],
['detail-timing','logs','The server logged a timeout after thirty seconds.','The server logged a timeout after thirty seconds.','After thirty seconds, the server logged a timeout.'],
['setup','tests','The team added a test for the retry limit.','The team added a test for the retry limit.','To check retry behavior, the team added a test for the retry limit.'],
['setup','deploy','The release was delayed until the database migration finished.','The release waited for the database migration to finish.','Before the release could proceed, the database migration had to finish.'],
['bridge','queue','The queue grew, so workers took longer to reach each job.','The queue grew, so workers took longer to reach each job.','As the queue grew, workers took longer to reach each job.'],
['bridge','review','The diff was large, so the review took longer.','The diff was large, so the review took longer.','The large diff made the review take longer.'],
['punchline','alerts','The team received more alerts than it could review.','The team received more alerts than it could review.','There were more alerts than the team could review; the alerts had the upper hand.'],
['punchline','config','The configuration change stopped requests from reaching the service.','The configuration change stopped requests from reaching the service.','The configuration change stopped requests at the door, before they reached the service.'],
['vocabulary','database','The database reads returned old values after a write.','The database reads returned old values after a write.','The database showed stale reads after a write.'],
['vocabulary','network','The request reached the server twice after a retry.','The request reached the server twice after a retry.','The retry delivered the request to the server twice.']
];
const FIXTURES=[0,1].map((round)=>({kind:'writing-gym-deck',version:1,id:'starter-'+(round+1),title:'Starter · round '+(round+1),seed:'writing-gym-'+(round+1),cards:pairs.map((p,i)=>({id:'starter-'+String(i+1).padStart(2,'0')+'-'+(round?'b':'a'),sentence:p[round?4:3],context:p[1],pairId:'pair-'+(i+1),hypothesis:p[0],variant:round?'B':'A',topic:p[1],claim:p[2]}))}));
