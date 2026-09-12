## Default Permission

Everything the phone build of Yames needs from its own native half: keeping
the click playing with the screen off, keeping the screen awake, answering the
system Back gesture, and opening a link in the browser. All four commands, and
no scope — there is nothing here to narrow, and the frontend calls all of them.

#### This default permission set includes the following:

- `allow-set-background-audio`
- `allow-keep-awake`
- `allow-open-url`
- `allow-set-back-intercept`
- `allow-set-event-channel`

## Permission Table

<table>
<tr>
<th>Identifier</th>
<th>Description</th>
</tr>


<tr>
<td>

`yames-mobile:allow-keep-awake`

</td>
<td>

Enables the keep_awake command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:deny-keep-awake`

</td>
<td>

Denies the keep_awake command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:allow-open-url`

</td>
<td>

Enables the open_url command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:deny-open-url`

</td>
<td>

Denies the open_url command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:allow-set-back-intercept`

</td>
<td>

Enables the set_back_intercept command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:deny-set-back-intercept`

</td>
<td>

Denies the set_back_intercept command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:allow-set-background-audio`

</td>
<td>

Enables the set_background_audio command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:deny-set-background-audio`

</td>
<td>

Denies the set_background_audio command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:allow-set-event-channel`

</td>
<td>

Enables the set_event_channel command without any pre-configured scope.

</td>
</tr>

<tr>
<td>

`yames-mobile:deny-set-event-channel`

</td>
<td>

Denies the set_event_channel command without any pre-configured scope.

</td>
</tr>
</table>
