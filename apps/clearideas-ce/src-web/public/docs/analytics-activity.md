# Analytics and Activity

Community Edition records practical activity events and exposes simple analytics reports.

## Activity Logging

The app logs important workflows such as site creation, file upload, file view, file download, search, user changes, MCP activity, and content changes.

## Analytics

The analytics section includes:

- dashboard counts
- storage usage
- content activity
- search terms
- most accessed content
- most active users
- usage times by hour

## Search Terms

Every search is recorded as a `content-searched` activity with the exact query, the channel it came from (web search, MCP, site chat, or an agent), and the number of matching files. Site owners and admins can review the terms searched in their sites in **Analytics → Search terms**, including how often each term was searched, by how many users, and how often it found nothing.

Which administrators can see a search is decided by where it matched:

- A search inside a site or folder is attributed to that site, whether or not it found anything.
- A search across all sites (the global search box, or an MCP search) is attributed **only to the sites where it matched**, with each site seeing only its own match count. A global search that matched nothing is kept in the audit trail but attributed to no site.

This means an administrator never learns what a shared user searched for in other sites. Conversely, members should expect that administrators of a site can see search terms that matched that site's content.

Search records are stored like any other activity; there is no automatic purge.

## Scoping

Analytics are scoped to sites the current user owns or administers. Viewers can open the analytics area, but reports only show data for sites they are allowed to analyze.

## Time Zones

Filters use the user profile time zone so selected dates match local expectations.
